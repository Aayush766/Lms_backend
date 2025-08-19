// routes/studentRoutes.js
const express = require('express');
const router = express.Router();
const { auth, isStudent } = require('../middleware/authMiddleware');
const Content = require('../models/Content'); // Assuming you have this model
const User = require('../models/User'); // Assuming you use User model here
const Quiz = require('../models/Quiz'); // IMPORT THE QUIZ MODEL
const FeedbackParameter = require('../models/FeedbackParameter');

// Import relevant controllers
const { getMe } = require('../controllers/userManagementController');
const { uploadProfilePicture, uploadMiddleware } = require('../controllers/uploadController');
const { getSessionsByGrade } = require('../controllers/sessionController');
const { getContentBySessionAndGrade } = require('../controllers/materialController');
const { submitStudentFeedback } = require('../controllers/feedBackController');
const { getAllTrainers } = require('../controllers/userManagementController');

// Import quiz controller functions
const {
    getQuizDetailsForStudent,
    getQuizForStudentToTake,
    submitQuiz,
    getQuizResultsForStudent,
    getStudentQuizAttempts
} = require('../controllers/quizController');

const { getStudentProgress } = require('../controllers/studentProgressController');

const { getStudentAttendanceHistory } = require('../controllers/attendanceController'); // <-- IMPORT NEW CONTROLLER

const { getFeedbackParameters } = require('../controllers/feedbackParametersController'); 

// ... (other routes) ...

// Get all content relevant to the student's grade across all sessions
// This route now fetches both generic content AND quizzes
router.get('/my-content', auth, isStudent, async (req, res) => {
    try {
        const studentId = req.user.id;
        const student = await User.findById(studentId).select('grade');

        if (!student) {
            return res.status(404).json({ msg: 'Student not found' });
        }

        // Fetch generic content (ebooks, videos, etc.)
        const genericContent = await Content.find({
            grade: student.grade
        }).populate('uploadedBy', 'name');

        // Fetch quizzes for the student's grade
        // We select specific fields, and importantly, exclude correct answers from the questions array
        const quizzes = await Quiz.find({
            grade: student.grade
        }).select('_id title description grade session attemptsAllowed timeLimit difficulty category dueDate instructions'); // dueDate is now included

        // Transform quiz objects to match the 'content' structure expected by the frontend
        // This ensures they have a 'type' property set to 'quiz'
        const transformedQuizzes = quizzes.map(quiz => ({
            ...quiz.toObject(), // Convert Mongoose document to a plain JavaScript object
            type: 'quiz' // Add the type field for frontend filtering
        }));

        // Combine all content types
        const allContent = [...genericContent, ...transformedQuizzes];

        res.json(allContent);

    } catch (err) {
        console.error('Error fetching student content (including quizzes):', err);
        res.status(500).json({ msg: 'Server error fetching content', error: err.message });
    }
});

// Route to get sessions for a specific grade (used by MyCourse.jsx)
router.get('/sessions', auth, isStudent, getSessionsByGrade);

// Route to get content for a specific session and grade (used by SessionDetails.jsx, if applicable)
router.get('/content', auth, isStudent, getContentBySessionAndGrade);

// Profile Management
router.get('/profile', auth, isStudent, getMe);
router.post('/upload-profile-picture', auth, isStudent, uploadMiddleware.single('profilePicture'), uploadProfilePicture);

// Feedback
router.post('/feedback/submit', auth, isStudent, submitStudentFeedback);

// Get Trainers list for students
router.get('/trainers', auth, isStudent, async (req, res) => {
    try {
        const trainers = await User.find({ role: 'trainer' }).select('_id name');
        res.json(trainers);
    } catch (error) {
        console.error('Error fetching trainers for students:', error);
        res.status(500).json({ msg: 'Server error fetching trainers.' });
    }
});

// --- QUIZ ROUTES ---
router.get('/quizzes/:quizId/details', auth, isStudent, getQuizDetailsForStudent);
router.get('/quizzes/:quizId/take', auth, isStudent, getQuizForStudentToTake);
router.post('/quizzes/:quizId/submit', auth, isStudent, submitQuiz);
router.get('/quizzes/:quizId/attempts/:attemptId/results', auth, isStudent, getQuizResultsForStudent);
router.get('/quizzes/my-attempts', auth, isStudent, getStudentQuizAttempts);

router.get('/progress', auth, isStudent, getStudentProgress);

// --- NEW ATTENDANCE ROUTE FOR STUDENTS TO VIEW THEIR OWN HISTORY ---
router.get('/attendance', auth, isStudent, (req, res) => {
    // Re-use getStudentAttendanceHistory, passing the student's own ID from req.user
    req.params.studentId = req.user.id;
    getStudentAttendanceHistory(req, res);
});

router.get('/feedback/parameters', auth, isStudent, async (req, res) => {
    try {
        const parameters = await FeedbackParameter.find().select('question'); // Only send the question field
        res.json(parameters.map(p => ({ name: p.question }))); // Adjust response to match frontend expectations
    } catch (err) {
        console.error('Error fetching student feedback parameters:', err);
        res.status(500).json({ msg: 'Server error fetching feedback parameters.' });
    }
});


module.exports = router;