const mongoose = require('mongoose');
const Content = require('../models/Content');
const Session = require('../models/Session');
const User = require('../models/User'); // Used for students and possibly trainers
const Principal = require('../models/Principal');
const School = require('../models/School');
const QuizAttempt = require('../models/QuizAttempt');
const Quiz = require('../models/Quiz'); // IMPORTANT: Ensure this is imported!
const Timetable = require('../models/TimeTable'); // ADD THIS LINE

// Helper to get principal's school details based on req.user
// This helper assumes `req.user.school` contains the school name string.
const getPrincipalSchoolDetails = async (req) => {
    // Ensure `req.user` exists and `req.user.school` (the school name string) is available
    if (!req.user || !req.user.school || typeof req.user.school !== 'string') {
        throw new Error("Principal's school information (name string) not found in token or not a string. Authentication middleware must provide `req.user.school` with the school name string.");
    }

    const schoolNameFromUser = req.user.school; // This is the school name string (e.g., "MBNS School")

    // Find the actual School document by its name.
    // This allows us to retrieve the school's ObjectId if needed for other operations.
    const school = await School.findOne({ schoolName: schoolNameFromUser });
    if (!school) {
        throw new Error(`Assigned school '${schoolNameFromUser}' not found in database for principal.`);
    }
    return school; // Return the full School document (contains _id and schoolName)
};


/**
 * @desc Get grades for the principal's assigned school
 * @route GET /api/principal/grades
 * @access Private (Principal only)
 */
exports.getPrincipalSchoolGrades = async (req, res) => {
    try {
        const principalSchool = await getPrincipalSchoolDetails(req);
        const principalSchoolName = principalSchool.schoolName;

        if (principalSchool.availableGrades && Array.isArray(principalSchool.availableGrades)) {
            return res.json({ grades: principalSchool.availableGrades.sort((a, b) => a - b) });
        }

        const uniqueGrades = await User.distinct('grade', {
            role: 'student',
            school: principalSchoolName
        });
        const grades = uniqueGrades.sort((a, b) => a - b);

        res.json({ grades });

    } catch (err) {
        console.error('Error fetching principal school grades:', err);
        if (err.message.includes("Principal's school information not found") || err.message.includes("Assigned school not found")) {
            return res.status(403).json({ message: err.message });
        }
        res.status(500).json({ message: 'Server error fetching grades', error: err.message });
    }
};

/**
 * @desc Get students for the principal's assigned school (and optional grade filter)
 * @route GET /api/principal/students
 * @access Private (Principal only)
 */
exports.getPrincipalSchoolStudents = async (req, res) => {
    try {
        const principalSchool = await getPrincipalSchoolDetails(req);
        const { grade } = req.query;

        let query = { role: 'student', school: principalSchool.schoolName };
        if (grade) {
            query.grade = parseInt(grade);
        }

        const students = await User.find(query)
            .select('-password -resetPasswordToken -resetPasswordExpire')
            .populate('assignedTrainer', 'name email');

        res.json({ students });
    } catch (err) {
        console.error('Error fetching principal school students:', err);
        if (err.message.includes("Principal's school information not found") || err.message.includes("Assigned school not found")) {
            return res.status(403).json({ message: err.message });
        }
        res.status(500).json({ message: 'Server error fetching students', error: err.message });
    }
};

/**
 * @desc Get an overview of content (sessions, ebooks, videos, quizzes) for all grades
 * NOTE: This currently does not filter by school. If content is school-specific,
 * adjust the query to include a school filter.
 * @route GET /api/principal/grades-overview
 * @access Private (Principal only)
 */
exports.getGradesOverview = async (req, res) => {
    try {
        // const principalSchool = await getPrincipalSchoolDetails(req);
        // const schoolFilter = { school: principalSchool.schoolName }; // Or principalSchool._id

        const gradesOverview = [];
        const allGrades = Array.from({ length: 12 }, (_, i) => i + 1);

        for (const grade of allGrades) {
            const sessionRecord = await Session.findOne({ grade: grade /* ...schoolFilter */ });
            const totalSessions = sessionRecord ? sessionRecord.sessions.length : 0;
            const contentForGrade = await Content.find({ grade: grade /* ...schoolFilter */ });

            const totalEbooks = contentForGrade.filter(c => c.type === 'ebook').length;
            const totalVideos = contentForGrade.filter(c => c.type === 'video').length;
            const totalQuizzes = contentForGrade.filter(c => c.type === 'quiz').length;

            gradesOverview.push({
                grade: grade,
                totalSessions: totalSessions,
                totalEbooks: totalEbooks,
                totalVideos: totalVideos,
                totalQuizzes: totalQuizzes,
            });
        }
        res.json({ gradesOverview });
    } catch (err) {
        console.error('Error fetching grades overview for Principal:', err);
        res.status(500).json({ msg: 'Server error fetching course overview.', error: err.message });
    }
};

/**
 * @desc Get detailed content (sessions, ebooks, videos, quizzes) for a specific grade
 * @route GET /api/principal/grade/:grade/detailed-content
 * @access Private (Principal only)
 */
exports.getDetailedGradeContent = async (req, res) => {
    try {
        const { grade } = req.params;
        if (isNaN(grade) || grade < 1 || grade > 12) {
            return res.status(400).json({ msg: 'Invalid grade specified.' });
        }

        // Add school filter here if content is school-specific
        // const principalSchool = await getPrincipalSchoolDetails(req);
        // const schoolFilter = { school: principalSchool.schoolName };

        const sessionRecord = await Session.findOne({ grade: parseInt(grade) /* ...schoolFilter */ });
        const sessions = sessionRecord ? sessionRecord.sessions : [];
        const content = await Content.find({ grade: parseInt(grade) /* ...schoolFilter */ });
        content.sort((a, b) => a.title.localeCompare(b.title));
        res.json({ sessions, content });
    } catch (err) {
        console.error(`Error fetching detailed content for Grade ${req.params.grade}:`, err);
        res.status(500).json({ msg: 'Server error fetching detailed content.', error: err.message });
    }
};

/**
 * @desc Get an overview of student counts per grade for the principal's school
 * @route GET /api/principal/students-overview
 * @access Private (Principal only)
 */
exports.getStudentsOverview = async (req, res) => {
    try {
        const principalSchool = await getPrincipalSchoolDetails(req);
        const principalSchoolName = principalSchool.schoolName;

        const studentsOverview = [];
        const allGrades = Array.from({ length: 12 }, (_, i) => i + 1);

        for (const grade of allGrades) {
            const studentCount = await User.countDocuments({
                role: 'student',
                grade: grade,
                school: principalSchoolName
            });
            studentsOverview.push({
                grade: grade,
                numberOfStudents: studentCount,
            });
        }
        res.json({ studentsOverview });
    } catch (err) {
        console.error('Error fetching students overview for Principal:', err);
        if (err.message.includes("Principal's school information not found") || err.message.includes("Assigned school not found")) {
            return res.status(403).json({ message: err.message });
        }
        res.status(500).json({ msg: 'Server error fetching student overview.', error: err.message });
    }
};

/**
 * @desc Get a detailed list of students for a specific grade in the principal's school
 * @route GET /api/principal/grade/:grade/students
 * @access Private (Principal only)
 */
exports.getDetailedStudentsList = async (req, res) => {
    try {
        const { grade } = req.params;
        const principalSchool = await getPrincipalSchoolDetails(req);
        const principalSchoolName = principalSchool.schoolName;

        if (isNaN(grade) || grade < 1 || grade > 12) {
            return res.status(400).json({ msg: 'Invalid grade specified.' });
        }
        const students = await User.find({
            role: 'student',
            grade: parseInt(grade),
            school: principalSchoolName
        }).select('-password').populate('assignedTrainer', 'name email');

        res.json({ students });
    } catch (err) {
        console.error(`Error fetching detailed student list for Grade ${req.params.grade}:`, err);
        if (err.message.includes("Principal's school information not found") || err.message.includes("Assigned school not found")) {
            return res.status(403).json({ message: err.message });
        }
        res.status(500).json({ msg: 'Server error fetching detailed student list.', error: err.message });
    }
};

/**
 * @desc Get all principals with their school names (Typically for Admin Dashboard)
 * @route GET /api/admin/principals (Moved to adminRoutes if intended for admin)
 * @access Private (Admin only)
 */
exports.getAllPrincipals = async (req, res) => {
    try {
        const principals = await Principal.find({}).select('-password');

        const principalsFormatted = principals.map(principal => ({
            _id: principal._id,
            name: principal.name,
            email: principal.email,
            school: principal.school,
            contactNumber: principal.contactNumber,
            gender: principal.gender,
            address: principal.address,
            dob: principal.dob,
            profilePicture: principal.profilePicture,
            createdAt: principal.createdAt,
            updatedAt: principal.updatedAt,
        }));

        res.json(principalsFormatted);
    } catch (err) {
        console.error('Error fetching all principals:', err);
        res.status(500).json({ msg: 'Server error fetching principal details.', error: err.message });
    }
};

exports.updatePrincipal = async (req, res) => {
    const { id } = req.params;
    const { name, email, contactNumber, gender, address, dob, profilePicture, school } = req.body;

    try {
        const principal = await Principal.findById(id);

        if (!principal) {
            return res.status(404).json({ msg: 'Principal not found.' });
        }

        if (name) principal.name = name;
        if (email) principal.email = email;
        if (contactNumber) principal.contactNumber = contactNumber;
        if (gender) principal.gender = gender;
        if (address) principal.address = address;
        if (dob) principal.dob = dob;
        if (profilePicture) principal.profilePicture = profilePicture;

        if (school) {
            const schoolDoc = await School.findOne({ schoolName: school });
            if (!schoolDoc) {
                return res.status(400).json({ msg: 'School with the provided name does not exist.' });
            }
            principal.school = school;
        }

        await principal.save();

        res.json({
            msg: 'Principal updated successfully',
            principal: {
                _id: principal._id,
                name: principal.name,
                email: principal.email,
                school: principal.school,
                contactNumber: principal.contactNumber,
                gender: principal.gender,
                address: principal.address,
                dob: principal.dob,
                profilePicture: principal.profilePicture,
                createdAt: principal.createdAt,
                updatedAt: principal.updatedAt,
            }
        });

    } catch (err) {
        console.error('Error updating principal:', err);
        if (err.code === 11000) {
            if (err.keyPattern.email) {
                return res.status(400).json({ msg: 'Email already exists.' });
            }
            if (err.keyPattern.school) {
                return res.status(400).json({ msg: 'This school is already assigned to another principal.' });
            }
        }
        res.status(500).json({ msg: 'Server error updating principal.', error: err.message });
    }
};

exports.deletePrincipal = async (req, res) => {
    const { id } = req.params;

    try {
        const principal = await Principal.findByIdAndDelete(id);

        if (!principal) {
            return res.status(404).json({ msg: 'Principal not found.' });
        }

        res.json({ msg: 'Principal deleted successfully' });
    } catch (err) {
        console.error('Error deleting principal:', err);
        res.status(500).json({ msg: 'Server error deleting principal.', error: err.message });
    }
};

exports.getStudentQuizAttempts = async (req, res) => {
    try {
        const { studentId } = req.params;

        const principalSchool = await getPrincipalSchoolDetails(req);
        const student = await User.findById(studentId).select('school');

        if (!student || student.school !== principalSchool.schoolName) {
            return res.status(403).json({ msg: 'Unauthorized to view quiz attempts for this student.' });
        }

        const quizAttempts = await QuizAttempt.find({ student: studentId })
            .populate('quiz', 'title description grade session difficulty category dueDate')
            .sort({ completedAt: -1 });

        const formattedAttempts = quizAttempts.map(attempt => ({
            ...attempt.toObject(),
            quizTitle: attempt.quiz ? attempt.quiz.title : 'Unknown Quiz',
        }));

        res.json({ quizAttempts: formattedAttempts });

    } catch (error) {
        console.error('Error fetching student quiz attempts for principal:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid student ID.' });
        }
        res.status(500).json({ msg: 'Server error fetching student quiz attempts.' });
    }
};

/**
 * @desc Get a list of quizzes for the principal's view
 * @route GET /api/principal/quizzes
 * @access Private (Principal only)
 * @queryParam {number} grade - Optional: Filter quizzes by grade
 */
exports.getQuizzesForPrincipal = async (req, res) => {
    try {
        const { grade } = req.query;

        let query = {};
        if (grade) {
            query.grade = parseInt(grade);
        }

        // IMPORTANT: If quizzes in your Quiz model are linked to a specific school, add a school filter here.
        // const principalSchool = await getPrincipalSchoolDetails(req);
        // query.school = principalSchool.schoolName;

        const quizzes = await Quiz.find(query)
            .select('-questions.correctAnswer -__v')
            .sort({ grade: 1, title: 1 });

        res.json({ quizzes });

    } catch (error) {
        console.error('Error fetching quizzes for principal:', error);
        res.status(500).json({ msg: 'Server error fetching quizzes.' });
    }
};

/**
 * @desc Get detailed results of a specific student's quiz attempt
 * @route GET /api/principal/student-quiz-detail/:quizId/:attemptId
 * @access Private (Principal only)
 */
exports.getStudentQuizAttemptDetails = async (req, res) => {
    try {
        const { quizId, attemptId } = req.params;

        const principalSchool = await getPrincipalSchoolDetails(req); // Get principal's school details

        // Fetch the QuizAttempt and populate the student and quiz details
        const attempt = await QuizAttempt.findById(attemptId)
            .populate('quiz') // Populate the entire quiz document
            .populate('student'); // Populate student for authorization check

        if (!attempt) {
            return res.status(404).json({ msg: 'Quiz attempt not found.' });
        }

        // Authorization check: Ensure student exists AND belongs to the principal's school.
        if (!attempt.student) {
            return res.status(404).json({ msg: 'Student associated with this quiz attempt not found.' });
        }

        if (attempt.student.school !== principalSchool.schoolName) {
            return res.status(403).json({ msg: 'Unauthorized: This student does not belong to your school.' });
        }

        // Sanity check: Ensure the quiz ID from the URL matches the attempt's quiz
        if (!attempt.quiz || attempt.quiz._id.toString() !== quizId) {
            return res.status(400).json({ msg: 'Bad Request: Quiz ID mismatch for this attempt.' });
        }

        // --- START OF ACTUAL FIX FOR MISTAKES REVIEW ---
        const questionsWithResults = attempt.quiz.questions.map(quizQuestion => {
            // Find the student's selected answer for this specific question
            const studentAnswer = attempt.answers.find(
                attemptAnswer => attemptAnswer.questionId.toString() === quizQuestion._id.toString()
            );

            // Determine the selected answer, defaulting to null if not found (e.g., skipped question)
            const selectedAnswer = studentAnswer ? studentAnswer.selectedOption : null; // 'selectedOption' from QuizAttempt.js

            return {
                _id: quizQuestion._id,
                questionText: quizQuestion.questionText,
                selectedAnswer: selectedAnswer,
                correctAnswer: quizQuestion.correctAnswer // Correct answer from Quiz.js
            };
        });
        // --- END OF ACTUAL FIX FOR MISTAKES REVIEW ---

        const responseData = {
            quizTitle: attempt.quiz.title, // Use title from populated quiz
            score: attempt.score,
            totalQuestions: attempt.totalQuestions,
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
            questionsWithResults: questionsWithResults, // Now correctly generated
        };

        res.json(responseData);

    } catch (err) {
        console.error('Error fetching quiz attempt details for principal:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid attempt or quiz ID provided.' });
        }
        if (err.message.includes("Principal's school information not found") || err.message.includes("Assigned school not found")) {
            return res.status(403).json({ message: err.message });
        }
        res.status(500).json({ msg: 'Server error fetching quiz attempt details.' });
    }
};

// Assuming this function is meant to exist for a /sessions route.
// Review if `getTrainerQuizReports` is the most appropriate name or if it should be in `quizController.js`.
exports.getTrainerQuizReports = async (req, res) => {
    try {
        const { sessionId, section, quizId } = req.params;

        const principalSchool = await getPrincipalSchoolDetails(req);

        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({ msg: 'Quiz not found.' });
        }

        // If quizzes are school-specific, uncomment this check:
        // if (quiz.school && quiz.school !== principalSchool.schoolName) {
        //     return res.status(403).json({ msg: 'Unauthorized to view this quiz report.' });
        // }

        // Filter quiz attempts to only include students from the principal's school
        const studentsInSchool = await User.find({ role: 'student', school: principalSchool.schoolName }).select('_id');
        const studentIdsInSchool = studentsInSchool.map(s => s._id);

        const quizAttempts = await QuizAttempt.find({
            quiz: quizId,
            student: { $in: studentIdsInSchool }
        })
            .populate('student', 'name email grade')
            .populate('quiz', 'title');

        const totalAttempts = quizAttempts.length;
        const totalScores = quizAttempts.reduce((sum, attempt) => sum + attempt.score, 0);
        const averageScore = totalAttempts > 0 ? (totalScores / totalAttempts).toFixed(2) : 0;

        const resultsByStudent = quizAttempts.map(attempt => ({
            studentId: attempt.student._id,
            studentName: attempt.student.name,
            studentGrade: attempt.student.grade,
            attemptId: attempt._id,
            score: attempt.score,
            totalQuestions: attempt.totalQuestions,
            completedAt: attempt.completedAt,
        }));

        res.json({
            quizTitle: quiz.title,
            sessionId,
            section,
            totalAttempts,
            averageScore,
            resultsByStudent
        });

    } catch (error) {
        console.error('Error fetching trainer quiz reports for principal:', error);
        if (error.message.includes("Principal's school information not found")) {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ msg: 'Server error fetching quiz reports.' });
    }
};

/**
 * @desc Get overall progress for a specific student, accessible by principal
 * @route GET /api/principal/students/:studentId/overall-progress
 * @access Private (Principal only)
 */
exports.getStudentOverallProgressForPrincipal = async (req, res) => {
    try {
        const { studentId } = req.params;
        const principalId = req.user.id; // Principal's ID from token

        // 1. Verify principal's school
        const principalSchool = await getPrincipalSchoolDetails(req);
        const principalSchoolId = principalSchool._id;

        // 2. Fetch the student and verify they belong to the principal's school
        const student = await User.findById(studentId).select('grade school');
        if (!student) {
            return res.status(404).json({ msg: 'Student not found.' });
        }
        // Ensure student's school is a String (school name) if Principal model uses String.
        // Assuming both User.school and Principal.school store the school name string.
        // If User.school is an ObjectId, you'd need to populate it first or compare IDs.
        // Based on your Principal.js snippet, Principal.school is a String.
        // If User.js also uses String for 'school', this comparison is correct.
        if (student.school !== principalSchool.schoolName) {
            return res.status(403).json({ msg: 'Access denied. Student is not in your school.' });
        }

        const studentGrade = student.grade;

        // 3. Calculate total available quizzes for the student's grade
        const totalQuizzes = await Quiz.countDocuments({ grade: studentGrade });

        // 4. Calculate completed quizzes for the student
        // Find distinct quiz IDs for which the student has completed an attempt
        const completedQuizAttempts = await QuizAttempt.find({
            student: studentId,
            // Assuming completion means a score greater than 0 or a specific status
            // Adjust 'score > 0' as per your definition of 'completed'
            score: { $gte: 0 } // Assuming any attempt (even 0 score) counts as 'attempted' for progress
        }).distinct('quiz');

        const numCompletedQuizzes = completedQuizAttempts.length;

        // 5. Calculate total available sessions for the student's grade
        const sessionsForGrade = await Session.find({ grade: studentGrade });
        const totalSessions = sessionsForGrade.length;

        // 6. Calculate completed sessions for the student
        let numCompletedSessions = 0;
        const uniqueCompletedQuizzes = completedQuizAttempts.map(id => id.toString());

        for (const session of sessionsForGrade) {
            const quizzesForSession = await Quiz.find({
                grade: studentGrade,
                session: session.sessionNumber // Assuming session number is stored on Quiz
            });

            if (quizzesForSession.length === 0) {
                // If a session has no quizzes, it might be considered 'completed' if content is non-quiz based
                // For demo, let's assume if no quiz, it's auto-complete.
                numCompletedSessions++;
            } else {
                // If there are quizzes, check if all of them are completed by the student
                const allSessionQuizzesCompleted = quizzesForSession.every(quiz =>
                    uniqueCompletedQuizzes.includes(quiz._id.toString())
                );
                if (allSessionQuizzesCompleted) {
                    numCompletedSessions++;
                }
            }
        }

        // 7. Calculate overall progress percentage
        const totalPossibleUnits = totalQuizzes + totalSessions;
        const completedUnits = numCompletedQuizzes + numCompletedSessions;

        let progressPercentage = 0;
        if (totalPossibleUnits > 0) {
            progressPercentage = (completedUnits / totalPossibleUnits) * 100;
        }

        res.json({
            progress: progressPercentage,
            totalQuizzes,
            numCompletedQuizzes,
            totalSessions,
            numCompletedSessions
        });

    } catch (error) {
        console.error('Error fetching student overall progress for principal:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid student ID format.' });
        }
        if (error.message.includes("Principal's school information") || error.message.includes("Assigned school")) {
            return res.status(403).json({ msg: error.message });
        }
        res.status(500).json({ msg: 'Server error fetching student progress.' });
    }
};

// NEW CONTROLLER FUNCTION: Get trainers assigned to the principal's school
// NEW CONTROLLER FUNCTION: Get trainers assigned to the principal's school
exports.getPrincipalSchoolTrainers = async (req, res) => {
    try {
        const principalSchool = await getPrincipalSchoolDetails(req);
        const principalSchoolName = principalSchool.schoolName; // Use the school name string for querying

        // Find all users with role 'trainer' who have the principal's school in their assignedSchools array
        const trainers = await User.find({
            role: 'trainer',
            assignedSchools: principalSchoolName // Assuming assignedSchools stores school names (strings)
        }).select('-password -resetPasswordToken -resetPasswordExpire'); // Exclude sensitive info

        // You might want to filter or select specific fields for trainers
        const formattedTrainers = trainers.map(trainer => ({
            _id: trainer._id,
            name: trainer.name,
            email: trainer.email,
            contactNumber: trainer.contactNumber,
            assignedGrades: trainer.assignedGrades,
            subject: trainer.subject,
            // FIX: Add the profilePicture field to be sent to the frontend
            profilePicture: trainer.profilePicture,
        }));

        res.json(formattedTrainers);

    } catch (error) {
        console.error('Error fetching trainers for principal\'s school:', error);
        if (error.message.includes("Principal's school information") || error.message.includes("Assigned school")) {
            return res.status(403).json({ msg: error.message });
        }
        res.status(500).json({ msg: 'Server error fetching school trainers.' });
    }
};

exports.getPrincipalSchoolTimetable = async (req, res) => {
    console.log('--- Inside getPrincipalSchoolTimetable controller ---');
    console.log('Request Params:', req.params);
    // Be cautious logging full req.user in production as it might contain sensitive data
    console.log('User (Principal) role:', req.user?.role);
    console.log('User (Principal) school (from token):', req.user?.school);

    try {
        const grade = parseInt(req.params.grade);

        if (isNaN(grade)) {
            console.log('Validation Error: Invalid grade received:', req.params.grade);
            return res.status(400).json({ msg: 'Invalid grade provided. Must be a number.' });
        }
        console.log(`Successfully parsed grade for timetable query: ${grade}`);

        let principalSchool;
        try {
            principalSchool = await getPrincipalSchoolDetails(req);
            console.log('Principal School details successfully retrieved.');
        } catch (schoolDetailsError) {
            console.error('Error in getPrincipalSchoolDetails:', schoolDetailsError.message);
            // This error likely means the principal's assigned school in their token doesn't match a school in DB
            return res.status(403).json({ message: schoolDetailsError.message });
        }
        
        const schoolId = principalSchool._id; // Get the ObjectId of the school
        console.log(`Attempting to find timetable for School ID: ${schoolId} and Grade: ${grade}`);

        const timetable = await Timetable.findOne({ 
            school: schoolId,
            grade: grade
        })
        .populate({
            path: 'school', // Explicitly populate school details to ensure it's linked
            select: 'schoolName'
        })
        .populate({
            path: 'schedule.trainer',
            select: 'name' // Populate trainer name within schedule entries
        })
        .exec(); // Execute the Mongoose query

        console.log('Mongoose timetable query executed.');

        if (!timetable) {
            console.log(`No timetable document found for Grade ${grade} at ${principalSchool.schoolName}. Returning 200 OK with null timetable.`);
            return res.status(200).json({
                msg: `No timetable found for Grade ${grade} at ${principalSchool.schoolName}.`,
                timetable: null
            });
        }

        console.log('Timetable found. Populated school name:', timetable.school?.schoolName);
        console.log('Timetable found. Sample schedule entry trainer name (if exists):', 
            timetable.schedule && timetable.schedule.length > 0 ? timetable.schedule[0].trainer?.name : 'N/A'
        );
        
        res.status(200).json({
            success: true,
            timetable: timetable
        });

    } catch (error) {
        console.error('Caught an unexpected error in getPrincipalSchoolTimetable:', error.message);
        console.error('Error stack:', error.stack); // Log the full stack trace for detailed debugging
        
        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(el => el.message);
            return res.status(400).json({ msg: 'Validation Error', errors });
        }
        // Handle Mongoose CastError (e.g., if an invalid ObjectId was somehow used)
        if (error.name === 'CastError') {
            return res.status(400).json({ msg: `Invalid ID format for ${error.path || 'an ID field'}: ${error.value || ''}` });
        }

        res.status(500).json({ msg: 'Server error fetching timetable.', error: error.message });
    }
};


exports.getPrincipalMonthlyReport = async (req, res) => {
    try {
        const { year, month } = req.query; // e.g., year=2024, month=7
        const parsedYear = parseInt(year);
        const parsedMonth = parseInt(month); // 1-indexed month

        if (isNaN(parsedYear) || isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
            return res.status(400).json({ msg: 'Invalid year or month provided.' });
        }

        const principalSchool = await getPrincipalSchoolDetails(req);
        const schoolId = principalSchool._id;

        // Define the start and end dates for the selected month
        const startDate = moment([parsedYear, parsedMonth - 1, 1]).startOf('month');
        const endDate = moment([parsedYear, parsedMonth - 1, 1]).endOf('month');

        // Fetch trainers assigned to this principal's school
        const trainers = await User.find({
            role: 'trainer',
            'assignedSchools.school': schoolId // Assuming trainers are linked to schools by their ObjectId
        });

        const reportData = [];

        for (const trainer of trainers) {
            const trainerMonthlyProgress = {};

            // Get distinct grades and subjects this trainer is assigned to or has sessions for
            const assignedGradesAndSubjects = new Set();
            const sessions = await Session.find({
                trainer: trainer._id,
                grade: { $exists: true },
                subject: { $exists: true }
            });

            sessions.forEach(session => {
                assignedGradesAndSubjects.add(`${session.grade}-${session.subject}`);
            });

            for (const gradeSubject of assignedGradesAndSubjects) {
                const [grade, subject] = gradeSubject.split('-');

                // Calculate progress (this is highly dependent on your data model for "progress")
                // For example, count completed sessions vs. total scheduled sessions for the month
                const totalScheduledSessions = await Timetable.countDocuments({
                    school: schoolId,
                    trainer: trainer._id,
                    grade: parseInt(grade),
                    subject: subject,
                    // Add date filtering for the month based on your timetable's schedule structure
                    // This part is complex and depends on how recurring schedules are stored.
                    // For simplicity, let's assume we count sessions conducted.
                });

                const conductedSessions = await ClassDetails.countDocuments({
                    trainer: trainer._id,
                    grade: parseInt(grade),
                    subject: subject,
                    school: schoolId,
                    date: { $gte: startDate.toDate(), $lte: endDate.toDate() }
                });

                let progressPercentage = 0;
                if (totalScheduledSessions > 0) {
                    progressPercentage = (conductedSessions / totalScheduledSessions) * 100;
                }

                // Placeholder for media files - you'll need logic to fetch these
                const mediaFiles = []; // Fetch related media if applicable, e.g., from Content model linked to sessions

                if (!trainerMonthlyProgress[subject]) {
                    trainerMonthlyProgress[subject] = {};
                }
                trainerMonthlyProgress[subject][`Grade ${grade}`] = {
                    progress: parseFloat(progressPercentage.toFixed(2)),
                    mediaFiles: mediaFiles // Populate with actual media if available
                };
            }

            reportData.push({
                trainerName: trainer.username || trainer.name, // Assuming trainer name is in username or name field
                trainerId: trainer._id,
                month: moment(startDate).format('MMMM YYYY'),
                monthlyProgress: trainerMonthlyProgress
            });
        }

        res.status(200).json(reportData); // Send the array of trainer reports

    } catch (error) {
        console.error('Error in getPrincipalMonthlyReport:', error.message);
        if (error.name === 'CastError' || error.message.includes('school information not found')) {
             return res.status(400).json({ msg: 'Invalid request or principal school not assigned.' });
        }
        res.status(500).json({ msg: 'Server Error', error: error.message });
    }
};


exports.getPrincipalSchoolSessions = async (req, res) => {
    try {
        const { grade } = req.query;

        if (!grade || isNaN(grade)) {
            return res.status(400).json({ msg: 'Valid grade query parameter is required.' });
        }

        // Assuming the principal is associated with a school and can only view sessions for that school's grades
        // This is a simplified approach, a more robust solution would check the principal's assigned school
        const sessions = await Session.find({ grade: parseInt(grade) }).sort({ sessionNumber: 1 });

        res.json({ sessions });
    } catch (err) {
        console.error('Error fetching principal school sessions:', err);
        res.status(500).json({ msg: 'Server error fetching sessions.' });
    }
};


exports.getPrincipalGradeDetailedContent = async (req, res) => {
    try {
        const { grade } = req.params;
        const gradeNum = parseInt(grade);
        if (isNaN(gradeNum)) {
            return res.status(400).json({ msg: 'Invalid grade provided. Must be a number.' });
        }

        const principalSchool = await getPrincipalSchoolDetails(req);
        const schoolName = principalSchool.schoolName;

        // Fetch all sessions for the grade
        const sessions = await Session.find({ grade: gradeNum, school: schoolName }).sort({ sessionNumber: 1 });

        // Fetch all content (ebooks, videos, quizzes) for the grade
        const content = await Content.find({ grade: gradeNum, school: schoolName }).sort({ session: 1, title: 1 });

        // Fetch all quizzes for the grade
        const quizzes = await Quiz.find({ grade: gradeNum, school: schoolName });

        // Combine all content into a single array for the frontend
        const allContent = [...content, ...quizzes];

        res.json({ sessions, content: allContent });
    } catch (err) {
        console.error(`Error fetching detailed content for Grade ${req.params.grade} for principal:`, err);
        if (err.message.includes("Principal's school information not found") || err.message.includes("Assigned school not found")) {
            return res.status(403).json({ message: err.message });
        }
        res.status(500).json({ message: 'Server error fetching detailed grade content', error: err.message });
    }
};

/**
 * @desc Get course progress analytics for all grades in the principal's school
 * @route GET /api/principal/analytics/course-progress
 * @access Private (Principal only)
 */
exports.getCourseProgressAnalytics = async (req, res) => {
    try {
        const principalSchool = await getPrincipalSchoolDetails(req);

        // Find all sessions for the school and group them by grade
        const sessionsByGrade = await Session.aggregate([
            {
                $match: {
                    school: principalSchool.schoolName,
                    // Assuming your Session model has a 'grade' field
                    grade: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: "$grade",
                    totalSessions: { $sum: 1 },
                    completedSessions: {
                        $sum: {
                            // Assuming 'isCompleted' is a boolean field on the session model
                            $cond: [{ $eq: ["$isCompleted", true] }, 1, 0]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    grade: "$_id",
                    totalSessions: 1,
                    completedSessions: 1
                }
            }
        ]);

        res.json(sessionsByGrade);
    } catch (error) {
        console.error('Error fetching course progress analytics:', error);
        res.status(500).json({ msg: 'Server error fetching course progress data.' });
    }
};