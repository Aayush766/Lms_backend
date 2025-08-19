// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import your User model
const Principal = require('../models/Principal');
const School = require('../models/School'); // Import School model as you'll need it directly

exports.auth = async (req, res, next) => {
    let token;

    // Check for token in Authorization header (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // Fallback to checking for token in cookies
    else if (req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }

    if (!token) {
        return res.status(401).json({ msg: 'Not authorized, no token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        let fetchedUserDocument; // This variable will hold the fetched user/principal document

        // Determine which model to query based on the role
        if (decoded.role === 'principal') {
            // Fetch from Principal model. School is already a string, no populate needed.
            fetchedUserDocument = await Principal.findById(decoded.id).select('-password');

            if (!fetchedUserDocument) {
                return res.status(401).json({ msg: 'Principal not found based on token.' });
            }

            // req.user for principal will now directly contain the school name string
            req.user = {
                id: fetchedUserDocument._id,
                role: decoded.role,
                school: fetchedUserDocument.school // This is directly the school name string
            };

            // OPTIONAL: If you want to attach the *full* School document for the principal
            // so controllers don't have to re-fetch, you could do it here:
            // const principalSchoolDoc = await School.findOne({ schoolName: fetchedUserDocument.school });
            // if (principalSchoolDoc) {
            //     req.user.fullSchoolDetails = principalSchoolDoc;
            // }


        } else {
            // Assume other roles (student, trainer, admin) are in the User model
            fetchedUserDocument = await User.findById(decoded.id).select('-password');

            if (!fetchedUserDocument) {
                return res.status(401).json({ msg: 'User not found based on token.' });
            }

            // If students also need their assigned trainer populated, add it here:
            if (fetchedUserDocument.role === 'student') {
                fetchedUserDocument = await fetchedUserDocument.populate('assignedTrainer', 'name email');
            }

            // If User model has a 'school' field for trainers and it's a ref (ObjectId):
            // And if your trainer routes need the school name from an ObjectId reference:
            if (fetchedUserDocument.role === 'trainer' && fetchedUserDocument.school && fetchedUserDocument.schema.paths.school.instance === 'ObjectID') {
                 fetchedUserDocument = await fetchedUserDocument.populate('school', 'schoolName');
                 // If you want req.user.school to be the string for trainers too
                 // req.user.school = fetchedUserDocument.school ? fetchedUserDocument.school.schoolName : null;
            }

            // For non-principals, just attach the fetched user document
            req.user = fetchedUserDocument;
            req.user.role = decoded.role; // Ensure role from decoded token is present
        }

        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(401).json({ msg: 'Not authorized, token failed or expired. Please log in again.' });
    }
};

// Your role-specific middlewares (isAdmin, isStudent, isTrainerOrAdmin, isPrincipal)
// remain the same.

exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ msg: 'Admin role required' });
    }
};

exports.isStudent = (req, res, next) => {
    if (req.user && req.user.role === 'student') {
        next();
    } else {
        return res.status(403).json({ msg: 'Student role required' });
    }
};

exports.isTrainerOrAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'trainer' || req.user.role === 'admin' || req.user.role === 'principal')) {
        next();
    } else {
        return res.status(403).json({ msg: 'Trainer or Admin role required' });
    }
};

exports.isPrincipal = (req, res, next) => {
    if (req.user && req.user.role === 'principal') {
        // req.user.school should directly be the school name string from the Principal document
        if (!req.user.school || typeof req.user.school !== 'string') {
            return res.status(403).json({ msg: "Principal's school name not found or not a string. Contact support." });
        }
        next();
    } else {
        return res.status(403).json({ msg: 'Principal role required' });
    }
};

exports.isParticipantInDoubtSession = async (req, res, next) => {
    try {
        const { doubtSessionId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        if (userRole === 'admin') {
            return next();
        }

        const doubtSession = await require('../models/Doubt').findById(doubtSessionId);

        if (!doubtSession) {
            return res.status(404).json({ msg: 'Doubt session not found for authorization check.' });
        }

        const isStudentParticipant = doubtSession.student.equals(userId);
        const isTrainerParticipant = doubtSession.trainer && doubtSession.trainer.equals(userId);

        if (!isStudentParticipant && !isTrainerParticipant) {
            return res.status(403).json({ msg: 'Not authorized to access this doubt session.' });
        }

        req.doubtSession = doubtSession;
        next();
    } catch (err) {
        console.error('Error in isParticipantInDoubtSession middleware:', err);
        res.status(500).json({ msg: 'Server error during authorization check.' });
    }
};

exports.canPrincipalViewStudentReport = async (req, res, next) => {
    try {
        // This middleware should verify if the authenticated principal (req.user)
        // has permission to view the report for the student identified by :studentId
        // or if the quiz/attempt is within their scope (e.g., associated with their school).

        const { studentId } = req.params; // Get studentId from route params
        const principalUser = req.user; // Principal's details from auth middleware

        if (!principalUser || principalUser.role !== 'principal') {
            return res.status(403).json({ msg: 'Access denied. Principal role required.' });
        }

        // Find the student to check their grade/school
        const student = await User.findById(studentId).select('grade school');
        if (!student) {
            return res.status(404).json({ msg: 'Student not found.' });
        }

        // Example check: Ensure the student belongs to the principal's school
        // Assuming principalUser.school is the _id of the school document,
        // and student.school is also the _id.
        // If principalUser.school is a string name, you'd need to fetch the school ID for comparison.
        if (student.school.toString() !== principalUser.school.toString()) { // Adjust this comparison based on your schema
            return res.status(403).json({ msg: 'Access denied. Student is not in your school.' });
        }

        // Optionally, you might want to check if the quiz is also associated with the principal's school/grade
        // For example, if you add quizId to params, you could fetch the quiz and check its grade/school.
        // const { quizId } = req.params;
        // const quiz = await Quiz.findById(quizId).select('grade');
        // if (quiz && quiz.grade !== student.grade) { ... deny access ... }

        next(); // If all checks pass, proceed to the next middleware/controller
    } catch (error) {
        console.error('Error in canPrincipalViewStudentReport middleware:', error);
        res.status(500).json({ msg: 'Server error during authorization check.' });
    }
};