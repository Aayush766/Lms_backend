// routes/principalRoutes.js
const express = require('express');
const router = express.Router();
const { auth, isPrincipal, canPrincipalViewStudentReport } = require('../middleware/authMiddleware');
const principalController = require('../controllers/principalController');
const { getStudentAttendanceHistory } = require('../controllers/attendanceController');
const { getSchoolMonthlyReport } = require('../controllers/reportController');
const Content = require('../models/Content'); // Make sure to import the Content model

// Principal-specific routes (ALL require auth and isPrincipal)
router.get('/grades', auth, isPrincipal, principalController.getPrincipalSchoolGrades);
router.get('/students', auth, isPrincipal, principalController.getPrincipalSchoolStudents);
router.get('/grades-overview', auth, isPrincipal, principalController.getGradesOverview);

// FIXED ROUTE: This new route directly handles the call from the frontend to fetch content by grade.
// It will query the Content model for all content items that match the specified grade.
router.get('/grade/:grade/detailed-content', auth, isPrincipal, async (req, res) => {
    try {
        const { grade } = req.params;
        if (!grade) {
            return res.status(400).json({ msg: 'Grade parameter is required.' });
        }
        // Assuming the 'Content' model has a 'grade' field to filter by
        const content = await Content.find({ grade: parseInt(grade) });
        res.json({ content });
    } catch (err) {
        console.error('Error fetching content by grade for principal:', err);
        res.status(500).json({ msg: 'Server error fetching content.' });
    }
});

router.get('/students-overview', auth, isPrincipal, principalController.getStudentsOverview);
router.get('/grade/:grade/students', auth, isPrincipal, principalController.getDetailedStudentsList);
router.get('/students/:studentId/quiz-attempts', auth, isPrincipal, principalController.getStudentQuizAttempts);
router.get('/sessions/:sessionId/sections/:section/quizzes/:quizId/results', auth, isPrincipal, principalController.getTrainerQuizReports);
router.get('/student-quiz-detail/:quizId/:attemptId', auth, isPrincipal, principalController.getStudentQuizAttemptDetails);
router.get('/quizzes', auth, isPrincipal, principalController.getQuizzesForPrincipal);
router.get('/students/:studentId/attendance-history', auth, isPrincipal, getStudentAttendanceHistory);
router.get('/students/:studentId/overall-progress', auth, isPrincipal, principalController.getStudentOverallProgressForPrincipal);
router.get('/trainers', auth, isPrincipal, principalController.getPrincipalSchoolTrainers);
router.get('/grades/:grade/timetable',
    (req, res, next) => { console.log('Reached principal timetable route handler setup'); next(); },
    auth,
    isPrincipal,
    (req, res, next) => { console.log('After auth & isPrincipal, about to call controller'); next(); },
    principalController.getPrincipalSchoolTimetable
);
router.get('/reports/monthly', auth, isPrincipal, getSchoolMonthlyReport);
router.get('/sessions', auth, isPrincipal, principalController.getPrincipalSchoolSessions);
router.get('/analytics/course-progress', auth, isPrincipal, principalController.getCourseProgressAnalytics);
module.exports = router;