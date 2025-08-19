// controllers/userManagementController.js

const User = require('../models/User');
const Principal = require('../models/Principal');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Not directly used in these functions but imported
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

// Create User (Admin, Trainer, or Student)
exports.createUser = async (req, res) => {
    try {
        const {
            name, email, password, role,
            gender, contactNumber, address, dob, profilePicture,

            // Student specific fields
            grade, session, class: studentClass, rollNumber, school, fatherName, assignedTrainer, batch,

            // Trainer specific fields
            subject, classesTaught, experience, assignedSchools, assignedGrades
        } = req.body;

        // --- DEBUGGING LOGS START (for new user creation) ---


        // --- Basic validation for ALL REQUIRED COMMON fields ---
        // Always trim inputs for consistency and to prevent whitespace issues
        const trimmedEmail = email ? email.trim() : '';
        const trimmedPassword = password ? password.trim() : '';

        if (!name || !trimmedEmail || !trimmedPassword || !role || !gender || !contactNumber || !address || !dob) {
            return res.status(400).json({ msg: 'Name, email, password, role, gender, contact number, address, and date of birth are required for all users.' });
        }

        // Check if user already exists
        let user = await User.findOne({ email: trimmedEmail });
        if (user) {
            return res.status(400).json({ msg: 'User with this email already exists.' });
        }

        // --- Prepare userData object with common fields ---
        const userData = {
            name,
            email: trimmedEmail,
            password: trimmedPassword, // <--- IMPORTANT FIX: Pass the plaintext password here.
                                        // The pre('save') hook in the User model will handle hashing this.
            role,
            gender,
            contactNumber,
            address,
            dob,
            profilePicture: profilePicture || '',
        };

        // --- Role-specific validation and data assignment ---
        if (role === 'student') {
            if (!grade || !studentClass || !rollNumber || !school || !fatherName || !assignedTrainer || !batch) {
                return res.status(400).json({ msg: 'Student details (grade, class, roll number, school, father\'s name, assigned trainer, batch) are required for student role.' });
            }
            userData.grade = grade;
            userData.session = session;
            userData.class = studentClass;
            userData.rollNumber = rollNumber;
            userData.school = school;
            userData.fatherName = fatherName;
            userData.assignedTrainer = assignedTrainer;
            userData.batch = batch;

        } else if (role === 'trainer') {
            if (!subject || !classesTaught || classesTaught.length === 0 || experience === undefined || experience === null || !assignedSchools || assignedSchools.length === 0 || !assignedGrades || assignedGrades.length === 0) {
                return res.status(400).json({ msg: 'Trainer details (subject, classes taught, experience, assigned schools, assigned grades) are required for trainer role.' });
            }
            userData.subject = subject;
            userData.classesTaught = classesTaught;
            userData.experience = experience;
            userData.assignedSchools = assignedSchools;
            userData.assignedGrades = assignedGrades;
        }

        // Create new user instance. The pre('save') hook in User model will hash the password.
        const newUser = new User(userData);
        await newUser.save(); // This will trigger the pre('save') hook to hash the password

        // --- DEBUGGING LOGS START (after save) ---
        console.log('New User Created Successfully!');
        console.log('Stored Hashed Password in DB (after save via pre-save hook):', newUser.password.substring(0, 10) + '...'); // Log first few chars
        // --- DEBUGGING LOGS END ---

        // Respond without sending the password hash back
        res.status(201).json({
            msg: `${role} created successfully`,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
                // Include other relevant non-sensitive fields
            }
        });

    } catch (err) {
        // Handle duplicate key errors (e.g., unique email)
        if (err.code === 11000) {
            if (err.keyPattern && err.keyPattern.email) {
                return res.status(400).json({ msg: 'Error creating user: Email already exists.' });
            }
            // If you have unique compound indexes for rollNumber/class/school, add their handling here
            if (err.keyPattern && err.keyPattern.rollNumber && req.body.role === 'student') {
                return res.status(400).json({ msg: 'Error creating user: Roll number already exists for this context.' });
            }
        }
        // Handle Mongoose validation errors
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: `Validation error: ${messages.join(', ')}` });
        }

        console.error('Error creating user:', err);
        res.status(500).json({ msg: 'Server error during user creation', error: err.message });
    }
};

exports.createPrincipal = async (req, res) => {
    try {
        const {
            name, email, password, role,
            gender, contactNumber, address, dob, profilePicture,
            school // Principal-specific field
        } = req.body;

        // Always trim inputs for consistency and to prevent whitespace issues
        const trimmedEmail = email ? email.trim() : '';
        const trimmedPassword = password ? password.trim() : '';

        // --- Basic validation for REQUIRED fields for Principal model ---
        // Assuming Principal.js is updated to include address and dob as required
        if (!name || !trimmedEmail || !trimmedPassword || !contactNumber || !gender || !address || !dob || !school) {
            return res.status(400).json({ msg: 'Name, email, password, gender, contact number, address, date of birth, and school are required for principals.' });
        }

        // Ensure the role is 'principal'
        if (role !== 'principal') {
            return res.status(400).json({ msg: `Invalid role specified for principal creation: ${role}.` });
        }

        // Check if a principal with this email already exists
        const principalExistsByEmail = await Principal.findOne({ email: trimmedEmail });
        if (principalExistsByEmail) {
            return res.status(400).json({ msg: 'Principal with that email already exists.' });
        }

        // Check if a principal for this school already exists (unique: true for school in Principal model)
        const principalExistsForSchool = await Principal.findOne({ school: school });
        if (principalExistsForSchool) {
            return res.status(400).json({ msg: `A principal for school '${school}' already exists. A school can only have one principal.` });
        }

        // Create the new principal
        const newPrincipal = await Principal.create({
            name,
            email: trimmedEmail,
            password: trimmedPassword,
            role: 'principal', // Explicitly set role for Principal model
            gender,
            contactNumber,
            address,
            dob,
            profilePicture: profilePicture || '', // profilePicture is optional
            school
        });

        res.status(201).json({ msg: 'Principal created successfully!', principal: newPrincipal });

    } catch (err) {
        console.error('Error creating principal:', err);
        // Handle Mongoose validation errors
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: messages.join(', ') });
        }
        // Handle duplicate key error for unique fields
        if (err.code === 11000) {
            const field = Object.keys(err.keyValue)[0];
            return res.status(400).json({ msg: `A principal with that ${field} already exists.` });
        }
        res.status(500).json({ msg: 'Server error during principal creation.' });
    }
};


// Get current logged-in user's data
exports.getMe = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role; // Get the role from the authenticated token

        let foundUser;
        let responseUser = {}; // Object to build the response with specific fields

        if (userRole === 'principal') {
            foundUser = await Principal.findById(userId).select('-password');
            if (!foundUser) {
                return res.status(404).json({ msg: 'Principal profile not found.' });
            }
            responseUser = {
                id: foundUser._id,
                name: foundUser.name,
                email: foundUser.email,
                role: userRole,
                gender: foundUser.gender,
                contactNumber: foundUser.contactNumber,
                address: foundUser.address,
                dob: foundUser.dob,
                profilePicture: foundUser.profilePicture,
                school: foundUser.school // Principal specific
            };
        } else {
            // Fetch from the User model for all other roles (admin, trainer, student)
            // Select all necessary fields for each role implicitly based on schema by default
            foundUser = await User.findById(userId).select('-password'); // This fetches all fields except password

            if (!foundUser) {
                return res.status(404).json({ msg: 'User profile not found.' });
            }

            // Common fields for all User model roles
            responseUser = {
                id: foundUser._id,
                name: foundUser.name,
                email: foundUser.email,
                role: userRole, // Use the role from the token for consistency
                gender: foundUser.gender,
                contactNumber: foundUser.contactNumber,
                address: foundUser.address,
                dob: foundUser.dob,
                profilePicture: foundUser.profilePicture,
            };

            // Add role-specific fields. Convert foundUser to a plain object to easily pick properties.
            const foundUserObject = foundUser.toObject();

            if (userRole === 'student') {
                responseUser.grade = foundUserObject.grade;
                responseUser.session = foundUserObject.session;
                responseUser.class = foundUserObject.class;
                responseUser.rollNumber = foundUserObject.rollNumber;
                responseUser.school = foundUserObject.school;
                responseUser.fatherName = foundUserObject.fatherName;
                responseUser.assignedTrainer = foundUserObject.assignedTrainer;
                responseUser.batch = foundUserObject.batch;
            } else if (userRole === 'trainer') {
                responseUser.subject = foundUserObject.subject;
                responseUser.classesTaught = foundUserObject.classesTaught;
                responseUser.experience = foundUserObject.experience;
                responseUser.assignedSchools = foundUserObject.assignedSchools;
                responseUser.assignedGrades = foundUserObject.assignedGrades;
            }
            // Admin role typically doesn't have many extra fields beyond common ones
        }

        res.json({ user: responseUser }); // Send the constructed responseUser object

    } catch (err) {
        console.error('Error in getMe (userManagementController):', err);
        res.status(500).json({ msg: 'Server error fetching user data' });
    }
    
};

// NEW: Update User Profile Picture
exports.updateProfilePicture = async (req, res) => {
    try {
        const userId = req.user.id; // User ID from the authenticated token
        const userRole = req.user.role; // Get role from token

        // Determine which model to query based on the user's role
        const userModel = userRole === 'principal' ? Principal : User;
        const user = await userModel.findById(userId);

        if (!user) {
            return res.status(404).json({ msg: 'User not found.' });
        }

        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded.' });
        }

        // Upload new image to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'profile_pictures', // Optional: folder in Cloudinary
            width: 150,
            height: 150,
            crop: 'fill'
        });

        // Delete old profile picture from Cloudinary if it exists
        // Extract public_id from the old URL to delete it from Cloudinary
        if (user.profilePicture) {
            const publicIdMatch = user.profilePicture.match(/\/profile_pictures\/([^/.]+)\./);
            if (publicIdMatch && publicIdMatch[1]) {
                const publicId = `profile_pictures/${publicIdMatch[1]}`;
                await cloudinary.uploader.destroy(publicId);
            }
        }

        // Update user's profilePicture URL in DB
        user.profilePicture = result.secure_url;
        await user.save({ validateBeforeSave: false }); // Avoid re-validating all schema fields, especially for student/trainer conditional fields

        // Delete the locally saved file after upload
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting local file:', err);
        });

        res.status(200).json({ msg: 'Profile picture updated successfully', profilePicture: user.profilePicture });

    } catch (err) {
        console.error('Error updating profile picture:', err);
        // Clean up local file if an error occurred after upload but before response
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting local file after upload failure:', unlinkErr);
            });
        }
        res.status(500).json({ msg: 'Server error during profile picture update' });
    }
};

// NEW: Get all Trainers
exports.getAllTrainers = async (req, res) => {
    try {
        const users = await User.find({ role: 'trainer' }).select('-password');
        res.json({ users });
    } catch (err) {
        console.error('Error fetching trainers:', err);
        res.status(500).json({ msg: 'Server error fetching trainers' });
    }
};

// NEW: Update Trainer Details
exports.updateTrainer = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, subject, classesTaught, experience, contactNumber, dob, assignedSchools, assignedGrades, gender, address } = req.body;

        const user = await User.findById(id);
        if (!user || user.role !== 'trainer') {
            return res.status(404).json({ msg: 'Trainer not found.' });
        }

        // Apply updates if values are provided and trim email/password
        user.name = name !== undefined ? name : user.name;
        user.email = email !== undefined ? email.trim() : user.email; // Trim email on update
        user.gender = gender !== undefined ? gender : user.gender;
        user.contactNumber = contactNumber !== undefined ? contactNumber : user.contactNumber;
        user.address = address !== undefined ? address : user.address;
        user.dob = dob !== undefined ? dob : user.dob; // Common DOB field

        if (password) {
            // This is correct: hash the new password directly for updates.
            // The pre('save') hook will correctly see this as a modification and NOT re-hash.
            user.password = await bcrypt.hash(password.trim(), 10); // Trim password on update
        }
        user.subject = subject !== undefined ? subject : user.subject;
        user.classesTaught = classesTaught !== undefined ? classesTaught : user.classesTaught;
        user.experience = experience !== undefined ? experience : user.experience;
        user.assignedSchools = assignedSchools !== undefined ? assignedSchools : user.assignedSchools;
        user.assignedGrades = assignedGrades !== undefined ? assignedGrades : user.assignedGrades;

        await user.save({ validateBeforeSave: true }); // Ensure validation runs

        res.json({ msg: 'Trainer updated successfully', user: user.toObject({ getters: true, virtuals: true }) });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Error updating trainer: Email already exists.' });
        }
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: `Validation error: ${messages.join(', ')}` });
        }
        console.error('Error updating trainer:', err);
        res.status(500).json({ msg: 'Server error updating trainer', error: err.message });
    }
};

// NEW: Assign Schools and Grades to Trainer
exports.assignTrainerSchoolsAndGrades = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedSchools, assignedGrades } = req.body;

        const user = await User.findById(id);
        if (!user || user.role !== 'trainer') {
            return res.status(404).json({ msg: 'Trainer not found.' });
        }

        user.assignedSchools = assignedSchools;
        user.assignedGrades = assignedGrades;

        await user.save({ validateBeforeSave: false }); // Only updating specific fields, can skip full validation

        res.json({ msg: 'Trainer assignments updated successfully', user: user.toObject({ getters: true, virtuals: true }) });

    } catch (err) {
        console.error('Error assigning schools/grades to trainer:', err);
        res.status(500).json({ msg: 'Server error assigning schools/grades' });
    }
};

// You might already have a deleteUser function that can be reused:
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params; // Get user ID from URL
        const userRole = req.user.role; // Get role from token
        let deletedUser;

        if (userRole === 'principal') {
            deletedUser = await Principal.findByIdAndDelete(id);
        } else {
            deletedUser = await User.findByIdAndDelete(id);
        }

        if (!deletedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Server error during user deletion' });
    }
};

// NEW: Get all Students (with filters)
exports.getAllStudents = async (req, res) => {
    try {
        const { school, grade } = req.query;
        let query = { role: 'student' };

        if (school) {
            query.school = school;
        }
        if (grade) {
            query.grade = parseInt(grade);
        }

        // Populate assignedTrainer to show trainer name
        const users = await User.find(query).select('-password').populate('assignedTrainer', 'name email');
        res.json({ users });
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ msg: 'Server error fetching students' });
    }
};

// NEW: Update Student Details
exports.updateStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, grade, session, class: studentClass, rollNumber, school, dob, fatherName, assignedTrainer, gender, contactNumber, address } = req.body;

        const user = await User.findById(id);
        if (!user || user.role !== 'student') {
            return res.status(404).json({ msg: 'Student not found.' });
        }

        // Apply updates if values are provided and trim email/password
        user.name = name !== undefined ? name : user.name;
        user.email = email !== undefined ? email.trim() : user.email; // Trim email on update
        user.gender = gender !== undefined ? gender : user.gender;
        user.contactNumber = contactNumber !== undefined ? contactNumber : user.contactNumber;
        user.address = address !== undefined ? address : user.address;
        user.dob = dob !== undefined ? dob : user.dob;
        user.fatherName = fatherName !== undefined ? fatherName : user.fatherName;


        if (password) {
            user.password = await bcrypt.hash(password.trim(), 10); // Trim password on update
        }
        user.grade = grade !== undefined ? grade : user.grade;
        user.session = session !== undefined ? session : user.session;
        user.class = studentClass !== undefined ? studentClass : user.class;
        user.rollNumber = rollNumber !== undefined ? rollNumber : user.rollNumber;
        user.school = school !== undefined ? school : user.school;
        user.assignedTrainer = assignedTrainer !== undefined ? assignedTrainer : user.assignedTrainer;

        await user.save({ validateBeforeSave: true });

        res.json({ msg: 'Student updated successfully', user: user.toObject({ getters: true, virtuals: true }) });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Error updating student: Email or Roll Number already exists.' });
        }
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: `Validation error: ${messages.join(', ')}` });
        }
        console.error('Error updating student:', err);
        res.status(500).json({ msg: 'Server error updating student', error: err.message });
    }
};

// NEW: Assign Trainer to Student
exports.assignStudentTrainer = async (req, res) => {
    try {
        const { id } = req.params;
        const { trainerId } = req.body; // Expect trainerId from frontend

        const student = await User.findById(id);
        if (!student || student.role !== 'student') {
            return res.status(404).json({ msg: 'Student not found.' });
        }

        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(400).json({ msg: 'Invalid trainer ID provided.' });
        }

        student.assignedTrainer = trainerId;
        await student.save({ validateBeforeSave: false }); // Skip full validation

        res.json({ msg: 'Trainer assigned successfully', student: student.toObject({ getters: true, virtuals: true }) });

    } catch (err) {
        console.error('Error assigning trainer to student:', err);
        res.status(500).json({ msg: 'Server error assigning trainer' });
    }
};

// NEW: Get all unique school names
exports.getAllSchools = async (req, res) => {
    try {
        const schools = await User.distinct('school', { role: 'student' });
        res.json(schools);
    } catch (err) {
        console.error('Error fetching all schools:', err);
        res.status(500).json({ msg: 'Server error fetching schools' });
    }
};

// NEW: Get unique grades for a specific school
exports.getGradesBySchool = async (req, res) => {
    try {
        const { schoolName } = req.params;
        const grades = await User.distinct('grade', { role: 'student', school: schoolName });
        // Sort grades numerically
        res.json({ grades: grades.sort((a, b) => a - b) });
    } catch (err) {
        console.error(`Error fetching grades for school ${schoolName}:`, err);
        res.status(500).json({ msg: `Server error fetching grades for school ${schoolName}` });
    }
};

// NEW: Get Trainer Feedback
exports.getTrainerFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const trainer = await User.findById(id).select('trainerFeedback');
        if (!trainer) {
            return res.status(404).json({ msg: 'Trainer not found.' });
        }
        res.json({ feedback: trainer.trainerFeedback });
    } catch (err) {
        console.error('Error fetching trainer feedback:', err);
        res.status(500).json({ msg: 'Server error fetching trainer feedback' });
    }
};

// NEW: Get Student Feedback (assuming feedback about students is stored on the student model)
exports.getStudentFeedback = async (req, res) => {
    try {
        const { id } = req.params;
        const student = await User.findById(id).select('studentFeedback'); // Assuming studentFeedback is on User model
        if (!student) {
            return res.status(404).json({ msg: 'Student not found.' });
        }
        res.json({ feedback: student.studentFeedback });
    } catch (err) {
        console.error('Error fetching student feedback:', err);
        res.status(500).json({ msg: 'Server error fetching student feedback' });
    }
};


exports.getStudentCountsByGenderAndSchool = async (req, res) => {
    try {
        const studentCounts = await User.aggregate([
            { $match: { role: 'student' } },
            {
                $group: {
                    _id: { school: "$school",grade: "$grade", gender: "$gender" },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: "$_id.school",
               
                    genders: {
                        $push: {
                            gender: "$_id.gender",
                            count: "$count"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    school: "$_id",
                     grades: 1,
                    genderCounts: "$genders"
                }
            }
        ]);
        res.json(studentCounts);
    } catch (err) {
        console.error('Error fetching student gender counts:', err);
        res.status(500).json({ msg: 'Server error fetching student gender counts.' });
    }
};

exports.createStudentsBulk = async (req, res) => {
    try {
        const { students } = req.body; // Expect an array of student objects

        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ msg: 'No student data provided for bulk upload.' });
        }

        const createdStudents = [];
        const errors = [];

        for (const studentData of students) {
            try {
                // --- Basic validation for EACH student in the bulk upload ---
                // Ensure required common fields are present
                const {
                    name, email, password, gender, contactNumber, address, dob,
                    grade, session, class: studentClass, rollNumber, school, fatherName, assignedTrainer, batch
                } = studentData;

                const trimmedEmail = email ? email.trim() : '';
                const trimmedPassword = password ? password.trim() : '';

                if (!name || !trimmedEmail || !trimmedPassword || !gender || !contactNumber || !address || !dob ||
                    !grade || !studentClass || !rollNumber || !school || !fatherName || !assignedTrainer || !batch) {
                    errors.push({ email: trimmedEmail, msg: 'Missing required fields for student.', data: studentData });
                    continue; // Skip to the next student
                }

                // Check if user with this email already exists
                let existingUser = await User.findOne({ email: trimmedEmail });
                if (existingUser) {
                    errors.push({ email: trimmedEmail, msg: 'User with this email already exists.', data: studentData });
                    continue; // Skip to the next student
                }

                // Prepare student data for Mongoose
                const newStudentData = {
                    name,
                    email: trimmedEmail,
                    password: trimmedPassword, // The pre('save') hook in User model will hash this
                    role: 'student', // Ensure role is always 'student' for this bulk endpoint
                    gender,
                    contactNumber,
                    address,
                    dob,
                    profilePicture: studentData.profilePicture || '', // Optional
                    grade: Number(grade),
                    session: session || '', // Session might be optional or have a default
                    class: studentClass,
                    rollNumber,
                    school,
                    fatherName,
                    assignedTrainer,
                    batch,
                };

                const newStudent = new User(newStudentData);
                await newStudent.save(); // This will trigger the pre('save') hook for password hashing
                createdStudents.push(newStudent);

            } catch (err) {
                // Handle individual student errors without stopping the entire bulk operation
                if (err.code === 11000) { // Duplicate key error
                    const field = Object.keys(err.keyPattern)[0];
                    errors.push({ email: studentData.email, msg: `Duplicate ${field}: ${err.keyValue[field]}.`, error: err.message, data: studentData });
                } else if (err.name === 'ValidationError') { // Mongoose validation error
                    const messages = Object.values(err.errors).map(val => val.message);
                    errors.push({ email: studentData.email, msg: `Validation error: ${messages.join(', ')}.`, error: err.message, data: studentData });
                } else {
                    errors.push({ email: studentData.email, msg: `Unhandled error during creation: ${err.message}.`, error: err.message, data: studentData });
                }
                console.error(`Error processing bulk student (${studentData.email}):`, err);
            }
        }

        if (createdStudents.length > 0 && errors.length === 0) {
            return res.status(201).json({ msg: `Successfully created ${createdStudents.length} student(s).`, createdCount: createdStudents.length });
        } else if (createdStudents.length > 0 && errors.length > 0) {
            return res.status(207).json({ // 207 Multi-Status
                msg: `Created ${createdStudents.length} student(s) with ${errors.length} error(s).`,
                createdCount: createdStudents.length,
                errorCount: errors.length,
                errors: errors
            });
        } else {
            return res.status(400).json({ msg: 'No students were created due to errors.', errorCount: errors.length, errors: errors });
        }

    } catch (err) {
        console.error('Fatal error during bulk student creation:', err);
        res.status(500).json({ msg: 'Server error during bulk student creation.', error: err.message });
    }
};