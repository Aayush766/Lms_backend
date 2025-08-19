// controllers/attendanceController.js
const Attendance = require('../models/Attendance');
const User = require('../models/User'); // Assuming 'User' model is used for all roles (Trainer, Student, Admin)
const Notification = require('../models/Notification');
const dayjs = require('dayjs');

// Helper to normalize date to start of UTC day for consistent storage/querying
const normalizeDate = (dateString) => {
    const date = new Date(dateString);
    date.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day
    return date;
};

// @desc    Mark attendance for students
// @route   POST /api/trainer/attendance/mark
// @access  Private (Trainer/Admin)
exports.markAttendance = async (req, res) => {
    try {
        const { attendanceRecords } = req.body; // Expect an array of { studentId, date, status, remarks, grade }
        const trainerId = req.user.id; // Trainer ID from auth middleware

        if (!attendanceRecords || !Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
            return res.status(400).json({ msg: 'Attendance records array is required and cannot be empty.' });
        }

        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(403).json({ msg: 'Only trainers can mark attendance.' });
        }

        const processedRecords = [];
        const errors = [];
        const notificationsToCreate = []; // Array to collect notifications

        for (const record of attendanceRecords) {
            const { studentId, date, status, remarks, grade } = record;

            // Basic validation for required fields in each record
            if (!studentId || !date || !status || !grade) {
                errors.push({ studentId: studentId || 'N/A', msg: 'Missing required fields (studentId, date, status, grade).' });
                continue;
            }

            const student = await User.findById(studentId);
            if (!student || student.role !== 'student') {
                errors.push({ studentId, msg: 'Student not found or not a student role.' });
                continue;
            }

            // Important: Verify if the trainer is assigned to this student's school/grade
            const trainerAssignedGrades = trainer.assignedGrades || [];
            const trainerAssignedSchools = trainer.assignedSchools || [];

            const isTrainerAssignedToGrade = trainerAssignedGrades.includes(student.grade);
            const isTrainerAssignedToSchool = trainerAssignedSchools.includes(student.school);

            if (!isTrainerAssignedToGrade || !isTrainerAssignedToSchool) {
                errors.push({ studentId, msg: `Trainer is not authorized to mark attendance for students in grade ${student.grade} at school ${student.school}.` });
                continue;
            }

            try {
                // Parse and normalize date to ensure it's just the date part for comparison/storage consistency
                const attendanceDate = normalizeDate(date);

                // Use findOneAndUpdate for upsert behavior (update if exists, create if not)
                const updatedRecord = await Attendance.findOneAndUpdate(
                    {
                        student: studentId,
                        trainer: trainerId,
                        date: attendanceDate,
                        grade: grade, // Assuming grade is part of your unique index
                        school: student.school // Assuming school is part of your unique index and the Attendance model
                    },
                    {
                        // Fields to set/update
                        $set: {
                            status,
                            remarks: remarks || '' // Ensure remarks is always a string, even if empty
                        }
                    },
                    {
                        upsert: true,   // Create the document if it doesn't exist
                        new: true,      // Return the modified document rather than the original
                        setDefaultsOnInsert: true // Apply schema defaults for new documents
                    }
                );
                processedRecords.push(updatedRecord);

                // Create notification for the student after successful attendance mark/update
                notificationsToCreate.push({
                    userId: studentId,
                    onModel: 'Student', // This notification is for a 'Student'
                    type: 'attendance',
                    message: `Your attendance for ${dayjs(attendanceDate).format('MMMM D, YYYY')} was marked as ${status}.`,
                    relatedData: { // Data for frontend to interpret (e.g., for calendar markers)
                        date: dayjs(attendanceDate).format('YYYY-MM-DD'),
                        status: status,
                    },
                    read: false, // Default to unread
                    createdAt: new Date(),
                    timeAsked: new Date(), // For consistency with your frontend's field
                });

            } catch (error) {
                if (error.code === 11000) {
                    errors.push({ studentId, msg: `Attendance already marked for this student on ${new Date(date).toLocaleDateString()} (or duplicate unique key issue).` });
                } else if (error.name === 'ValidationError') {
                    const messages = Object.values(error.errors).map(val => val.message);
                    errors.push({ studentId, msg: `Validation failed: ${messages.join(', ')}` });
                } else {
                    errors.push({ studentId, msg: `Error saving/updating attendance: ${error.message}` });
                }
            }
        }

        // Insert all collected notifications into the database
        if (notificationsToCreate.length > 0) {
            await Notification.insertMany(notificationsToCreate);
        }

        if (errors.length > 0) {
            return res.status(207).json({ // 207 Multi-Status for partial success/failure
                msg: 'Some attendance records could not be processed or updated.',
                processedCount: processedRecords.length,
                errorCount: errors.length,
                errors: errors,
                successfulRecords: processedRecords
            });
        }

        res.status(201).json({ msg: 'Attendance marked/updated successfully.', records: processedRecords });

    } catch (err) {
        console.error('Error marking attendance:', err);
        res.status(500).json({ msg: 'Server error marking attendance.' });
    }
};

// @desc    Get attendance for students (filtered by trainer's assigned grades/schools)
// @route   GET /api/trainer/attendance/view
// @access  Private (Trainer/Admin)
exports.viewAttendance = async (req, res) => {
    try {
        const trainerId = req.user.id;
        // Destructure school and grade filters directly from req.query
        const { studentId, grade, school, startDate, endDate } = req.query;

        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(403).json({ msg: 'Only trainers can view attendance.' });
        }

        let query = {};
        query.trainer = trainerId; // Filter by the requesting trainer

        // Filter by grade if provided and if the trainer is assigned to it
        if (grade) {
            const trainerAssignedGrades = trainer.assignedGrades || [];
            if (!trainerAssignedGrades.includes(parseInt(grade))) {
                return res.status(403).json({ msg: 'Trainer is not assigned to this grade.' });
            }
            query.grade = parseInt(grade);
        }

        // Filter by school if provided and if the trainer is assigned to it
        if (school) {
            const trainerAssignedSchools = trainer.assignedSchools || [];
            if (!trainerAssignedSchools.includes(school)) {
                return res.status(403).json({ msg: 'Trainer is not assigned to this school.' });
            }
            // Now that 'school' is expected on the Attendance model, query directly
            query.school = school;
        }

        if (studentId) {
            query.student = studentId;
        }

        if (startDate || endDate) {
            query.date = {};
            if (startDate) {
                query.date.$gte = normalizeDate(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setUTCHours(23, 59, 59, 999); // End of the day
                query.date.$lte = end;
            }
        }

        // Populate student details (name, email, school, grade)
        const attendanceRecords = await Attendance.find(query)
            .populate('student', 'name email school grade') // Populate specific student fields
            .populate('trainer', 'name email') // Populate trainer details too
            .sort({ date: -1, 'student.name': 1 }); // Sort by date descending, then student name ascending

        res.json({ records: attendanceRecords });

    } catch (err) {
        console.error('Error viewing attendance:', err);
        res.status(500).json({ msg: 'Server error viewing attendance.' });
    }
};

// @desc    Get attendance status for a single student for a date range
// @route   GET /api/student/:studentId/attendance
// @access  Private (Trainer/Admin - to check others, or Student - to check their own)
exports.getStudentAttendanceHistory = async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const { startDate, endDate } = req.query; // Optional date range

        // Authorization check:
        const requestingUser = req.user; // From auth middleware

        // Fetch the target student to get their school
        const targetStudent = await User.findById(studentId).select('name role grade school');
        if (!targetStudent || targetStudent.role !== 'student') {
            return res.status(404).json({ msg: 'Student not found.' });
        }

        // Student can only view their own attendance
        if (requestingUser.role === 'student' && requestingUser.id !== studentId) {
            return res.status(403).json({ msg: 'You can only view your own attendance history.' });
        }

        // Trainer can view attendance for students assigned to their grades/schools
        if (requestingUser.role === 'trainer') {
            const trainer = await User.findById(requestingUser.id);
            const trainerAssignedGrades = trainer.assignedGrades || [];
            const trainerAssignedSchools = trainer.assignedSchools || [];

            if (!trainerAssignedGrades.includes(targetStudent.grade) || !trainerAssignedSchools.includes(targetStudent.school)) {
                return res.status(403).json({ msg: 'You are not authorized to view attendance for this student.' });
            }
        }

        // NEW: Principal can view attendance for students in their school
        if (requestingUser.role === 'principal') {
            // Assuming req.user.school for principal is the school name string
            // and targetStudent.school is also the school name string
            if (requestingUser.school !== targetStudent.school) {
                return res.status(403).json({ msg: 'You are not authorized to view attendance for students outside your school.' });
            }
        }

        let query = { student: studentId };

        if (startDate || endDate) {
            query.date = {};
            if (startDate) {
                query.date.$gte = normalizeDate(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setUTCHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        const attendanceRecords = await Attendance.find(query)
            .populate('trainer', 'name')
            .sort({ date: -1 });

        res.json({ student: targetStudent.name, records: attendanceRecords });

    } catch (err) {
        console.error('Error fetching student attendance history:', err);
        res.status(500).json({ msg: 'Server error fetching student attendance history.' });
    }
};

// @desc    Get students assigned to the trainer (by grade and school)
// @route   GET /api/trainer/my-assigned-students
// @access  Private (Trainer/Admin)
exports.getMyAssignedStudents = async (req, res) => {
    try {
        const trainerId = req.user.id; // Trainer ID from auth middleware
        const { grade, school } = req.query; // Get grade and school from query parameters

        if (!grade || !school) {
            return res.status(400).json({ msg: 'Grade and school parameters are required.' });
        }

        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(403).json({ msg: 'Only trainers can view assigned students.' });
        }

        const trainerAssignedGrades = trainer.assignedGrades || [];
        const trainerAssignedSchools = trainer.assignedSchools || [];

        // Validate if the trainer is assigned to the requested grade and school
        if (!trainerAssignedGrades.includes(parseInt(grade)) || !trainerAssignedSchools.includes(school)) {
            return res.status(403).json({ msg: `Trainer is not authorized to view students for grade ${grade} at school ${school}.` });
        }

        // Find students who belong to the specified grade and school
        const students = await User.find({
            role: 'student',
            grade: parseInt(grade),
            school: school,
        }).select('name email grade school'); // Select relevant student fields

        if (!students || students.length === 0) {
            return res.status(404).json({ msg: 'No students found for the specified grade and school within your assignments.' });
        }

        res.json({ students });

    } catch (err) {
        console.error('Error fetching assigned students:', err);
        res.status(500).json({ msg: 'Server error fetching assigned students.' });
    }
};