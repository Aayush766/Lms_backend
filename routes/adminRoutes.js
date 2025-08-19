// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { auth, isAdmin } = require('../middleware/authMiddleware');
const { createUser, createPrincipal, } = require('../controllers/userManagementController');
const { uploadContent, getAllContent, uploadMultipleContent, deleteContent } = require('../controllers/materialController');
const { addSession, getSessionsByGrade } = require('../controllers/sessionController');
const {
    getAllTrainers,
    updateTrainer,
    deleteUser,
    assignTrainerSchoolsAndGrades,
    getAllStudents,
    updateStudent,
    assignStudentTrainer,
    getAllSchools: getAllUniqueSchoolsFromStudents,
    getGradesBySchool,
    getStudentFeedback,
    getStudentCountsByGenderAndSchool,
    createStudentsBulk
} = require('../controllers/userManagementController');

// Import the new school controller functions, including the modified timetable ones
const {
    addSchool,
    getAllSchools,
    getSchoolDetails,
    updateSchool,
    deleteSchool,
    getAssignedTrainersBySchool,
    getStudentsBySchool,
    getTimetableBySchoolAndGrade, // Updated to use schoolId
    editTimetableBySchoolAndGrade, // Updated to use schoolId
    deleteTimetable // New function for deleting timetable
} = require('../controllers/schoolController');

const { getTrainerStudentFeedback } = require('../controllers/feedBackController');
const { getTrainerToAdminFeedback } = require('../controllers/trainerFeedbackController');
// --- NEW IMPORTS FOR QUIZ CONTROLLER ---
const {
    createQuiz,
    getAllQuizzes,
    getQuizById,
    updateQuiz,
    deleteQuiz,
    getStudentQuizAttempts,
    getQuizAttemptsForQuiz
} = require('../controllers/quizController');

// --- NEW IMPORTS FOR ATTENDANCE CONTROLLER ---
const {
    viewAttendance, // Admin can view all attendance
    getStudentAttendanceHistory // Admin can view a specific student's history
} = require('../controllers/attendanceController');

const {
    getAllTrainerAttendanceRequests,
    reviewTrainerAttendanceRequest,
    // NEW: Import the trainer attendance functions
    getTrainerAttendance,
    getTrainerAttendanceHistory,
    verifyTrainerAttendance
} = require('../controllers/trainerAttendanceController');

// ADD THIS IMPORT STATEMENT FOR PRINCIPAL CONTROLLER FUNCTIONS
const {
    getAllPrincipals,
    updatePrincipal,
    deletePrincipal,
    // Add any other principalController functions used in this file if applicable
} = require('../controllers/principalController');


const { getSchoolMonthlyReport } = require('../controllers/reportController');


const {
    createHoliday,
    getAllHolidays,
    deleteHoliday
} = require('../controllers/holidayController');


// Multer configuration (temporary disk storage for Cloudinary upload)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        cb(null, uniqueName);
    }
});


const { getFeedbackParameters, createFeedbackParameter, updateFeedbackParameter, deleteFeedbackParameter, setDefaultFeedbackParameter } = require('../controllers/feedbackParametersController'); // ADD THIS IMPORT

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    const allowedDocExtensions = ['.ppt', '.pptx', '.pdf', '.doc', '.docx'];
    const allowedVideoMimeTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-flv'];

    const contentType = req.body.type;

    if (contentType === 'video') {
        if (allowedVideoMimeTypes.includes(mime)) {
            cb(null, true);
        } else {
            cb(new Error(`Only video files (${allowedVideoMimeTypes.join(', ')}) are allowed for video content.`), false);
        }
    } else if (contentType === 'ebook' || contentType === 'presentation_multiple') {
        if (allowedDocExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Only document files (${allowedDocExtensions.join(', ')}) are allowed for ${contentType} content.`), false);
        }
    } else {
        cb(new Error('Invalid content type or file type.'));
    }
};


const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500 MB
    }
});

console.log('Type of getAllContent:', typeof getAllContent);

// Admin Routes (all require auth and isAdmin)
router.post('/create-user', auth, isAdmin, createUser);
router.post('/create-principal', auth, isAdmin, createPrincipal);
router.post('/upload-content', auth, isAdmin, upload.single('file'), uploadContent);
router.post('/upload-multiple-content', auth, isAdmin, upload.array('files'), uploadMultipleContent);
router.get('/content', auth, isAdmin, getAllContent);
router.delete('/content/:id', auth, isAdmin, deleteContent);

router.post('/add-session', auth, isAdmin, addSession);
router.get('/sessions', auth, isAdmin, getSessionsByGrade);

router.get('/trainers', auth, isAdmin, getAllTrainers);
router.put('/trainers/:id', auth, isAdmin, updateTrainer);
router.delete('/trainers/:id', auth, isAdmin, deleteUser);
router.put('/trainers/:id/assign', auth, isAdmin, assignTrainerSchoolsAndGrades);

router.get('/students', auth, isAdmin, getAllStudents);
router.put('/students/:id', auth, isAdmin, updateStudent);
router.delete('/students/:id', auth, isAdmin, deleteUser);
router.put('/students/:id/assign-trainer', auth, isAdmin, assignStudentTrainer);

// School-related routes
router.get('/schools/unique-student-schools', auth, isAdmin, getAllUniqueSchoolsFromStudents);
router.get('/schools/:schoolName/grades', auth, isAdmin, getGradesBySchool);

router.get('/trainers/:trainerId/student-feedback', auth, isAdmin, getTrainerStudentFeedback);
router.get('/students/:id/feedback', auth, isAdmin, getStudentFeedback);

// NEW SCHOOL MANAGEMENT ROUTES
router.post('/schools', auth, isAdmin, addSchool);
router.get('/schools', auth, isAdmin, getAllSchools);
router.get('/schools/:id', auth, isAdmin, getSchoolDetails);
router.put('/schools/:id', auth, isAdmin, updateSchool);
router.delete('/schools/:id', auth, isAdmin, deleteSchool);

router.get('/schools/:schoolName/trainers', auth, isAdmin, getAssignedTrainersBySchool);
router.get('/schools/:schoolName/students', auth, isAdmin, getStudentsBySchool);

// UPDATED TIMETABLE ROUTES TO USE SCHOOL ID
router.get('/schools/:schoolId/grades/:grade/timetable', auth, isAdmin, getTimetableBySchoolAndGrade);
router.put('/schools/:schoolId/grades/:grade/timetable', auth, isAdmin, editTimetableBySchoolAndGrade);
router.delete('/schools/:schoolId/grades/:grade/timetable', auth, isAdmin, deleteTimetable); // New delete route

// QUIZ MANAGEMENT ROUTES FOR ADMIN
router.post('/quizzes', auth, isAdmin, createQuiz);
router.get('/quizzes', auth, isAdmin, getAllQuizzes);
router.get('/quizzes/:id', auth, isAdmin, getQuizById);
router.put('/quizzes/:id', auth, isAdmin, updateQuiz);
router.delete('/quizzes/:id', auth, isAdmin, deleteQuiz);
router.get('/quizzes/:quizId/attempts', auth, isAdmin, getQuizAttemptsForQuiz);
router.get('/students/:studentId/quiz-attempts', auth, isAdmin, getStudentQuizAttempts);

// --- NEW ATTENDANCE ROUTES FOR ADMIN ---
router.get('/attendance', auth, isAdmin, viewAttendance); // Admin can view all attendance, with broader filters
router.get('/students/:studentId/attendance-history', auth, isAdmin, getStudentAttendanceHistory); // Admin can view any student's history
// --- END ATTENDANCE ROUTES ---

router.get('/trainer-to-admin-feedback', auth, isAdmin, getTrainerToAdminFeedback);


router.get('/trainer-attendance-requests', auth, isAdmin, getAllTrainerAttendanceRequests);
router.put('/trainer-attendance-requests/:id/review', auth, isAdmin, reviewTrainerAttendanceRequest);


router.get('/principals', auth, isAdmin, getAllPrincipals); // Existing route, now using populated data
router.put('/principals/:id', auth, isAdmin, updatePrincipal); // NEW: Update principal by ID
router.delete('/principals/:id', auth, isAdmin, deletePrincipal);

router.get('/reports/school-monthly', auth, isAdmin, getSchoolMonthlyReport);

router.get('/student-gender-counts', auth, isAdmin, getStudentCountsByGenderAndSchool);


router.post('/create-students-bulk', auth, isAdmin, createStudentsBulk);

router.get('/feedback-parameters', auth, isAdmin, getFeedbackParameters);
router.post('/feedback-parameters', auth, isAdmin, createFeedbackParameter);
router.put('/feedback-parameters/:id', auth, isAdmin, updateFeedbackParameter);
router.delete('/feedback-parameters/:id', auth, isAdmin, deleteFeedbackParameter);
router.put('/feedback-parameters/set-default/:id', auth, isAdmin, setDefaultFeedbackParameter);

const {
    getUserCounts,
    getNewUserTrend,
    getContentCountsByGrade,
    getStudentCountsBySchool
} = require('../controllers/dashboardController');

// --- NEW ROUTES FOR ADMIN DASHBOARD ANALYTICS ---
// The dashboard routes will be prefixed with '/admin' from the parent route, so they will be like '/api/admin/dashboard/user-counts'
router.get('/dashboard/user-counts', auth, isAdmin, getUserCounts);
router.get('/dashboard/new-users-trend', auth, isAdmin, getNewUserTrend);
router.get('/dashboard/content-by-grade', auth, isAdmin, getContentCountsByGrade);
router.get('/dashboard/student-counts-by-school', auth, isAdmin, getStudentCountsBySchool);


// NEW: Trainer Attendance Routes for Admin
router.get('/trainer-attendance', auth, isAdmin, getTrainerAttendance); // Get trainer attendance for a specific date
router.get('/trainers/:trainerId/attendance-history', auth, isAdmin, getTrainerAttendanceHistory); // Get a specific trainer's attendance history
router.put('/trainer-attendance/:id/verify', auth, isAdmin, verifyTrainerAttendance); // ADD THIS LINE


router.post('/holidays', auth, isAdmin, createHoliday);
router.get('/holidays', auth, isAdmin, getAllHolidays);
router.delete('/holidays/:id', auth, isAdmin, deleteHoliday);

module.exports = router;