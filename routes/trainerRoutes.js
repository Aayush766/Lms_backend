// routes/trainerRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Timetable = require('../models/TimeTable');
const { auth, isTrainerOrAdmin } = require('../middleware/authMiddleware');
const Content = require('../models/Content');
const User = require('../models/User');
const Session = require('../models/Session');
const School = require('../models/School');
const { updateProfilePicture } = require('../controllers/userManagementController');
const { getSessionsByGrade } = require('../controllers/sessionController');
const {
    markAttendance,
    viewAttendance,
    getStudentAttendanceHistory,
    getMyAssignedStudents
} = require('../controllers/attendanceController');

const { submitFeedbackToAdmin } = require('../controllers/trainerFeedbackController');

const {
    requestTrainerAttendance,
    getMyTrainerAttendanceRequests,
    markTrainerAttendance,
     getMyTrainerAttendanceHistory
} = require('../controllers/trainerAttendanceController');

const quizController = require('../controllers/quizController');



// Multer configuration for profile picture upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const mime = file.mimetype;
    const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];

    if (allowedImageMimeTypes.includes(mime)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF) are allowed for profile pictures.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

// --- TRAINER PROFILE ROUTES ---
router.get('/profile', auth, isTrainerOrAdmin, async (req, res) => {
    try {
        console.log('--- DEBUGGING /api/trainer/profile ---');
        console.log('1. After auth and isTrainerOrAdmin middleware: req.user:', req.user);
        if (req.user) {
            console.log('   req.user.id:', req.user.id);
            console.log('   req.user.role:', req.user.role);
        } else {
            console.log('   req.user is undefined or null. This indicates an issue in auth/isTrainerOrAdmin.');
        }

        const trainer = await User.findById(req.user.id).select('-password');

        console.log('2. After fetching trainer from DB: trainer object:', trainer);
        if (trainer) {
            console.log('   trainer._id:', trainer._id);
            console.log('   trainer.role from DB:', trainer.role);
            console.log('   trainer.name from DB:', trainer.name);
        } else {
            console.log('   Trainer not found in DB for req.user.id:', req.user ? req.user.id : 'N/A');
        }

        if (!trainer) {
            console.log('TRAINER PROFILE: Sending 404 - Trainer profile not found.');
            return res.status(404).json({ msg: 'Trainer profile not found.' });
        }

        if (trainer.role !== 'trainer' && trainer.role!=='admin') {
            console.log('TRAINER PROFILE: Sending 403 - Access denied. Not a trainer. Actual role:', trainer.role);
            return res.status(403).json({ msg: 'Access denied. Not a trainer.' });
        }
        console.log('TRAINER PROFILE: Successfully fetched trainer profile.');
        res.json({ user: trainer });
    } catch (err) {
        console.error('TRAINER PROFILE ROUTE ERROR:', err.message);
        res.status(500).send('Server Error fetching trainer profile.');
    }
});

router.post('/update-profile-picture', auth, isTrainerOrAdmin, upload.single('profilePic'), updateProfilePicture);
// --- CONTENT & SESSION RELATED ROUTES ---
router.get('/my-uploaded-content', auth, isTrainerOrAdmin, async (req, res) => {
    try {
        const trainerId = req.user.id;
        const content = await Content.find({ uploadedBy: trainerId }).populate('uploadedBy', 'name');
        res.json(content);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
});

router.get('/grades', auth, isTrainerOrAdmin, async (req, res) => {
    try {
        const availableGrades = await Session.distinct('grade');
        res.json({ grades: availableGrades.sort((a,b) => a-b) });
    } catch (err) {
        console.error('Error fetching distinct grades:', err);
        res.status(500).json({ msg: 'Server error fetching grades.' });
    }
});

router.get('/sessions', auth, isTrainerOrAdmin, getSessionsByGrade);

router.get('/content', auth, isTrainerOrAdmin, async (req, res) => {
    try {
        const { grade } = req.query;
        if (!grade) {
            return res.status(400).json({ msg: 'Grade parameter is required.' });
        }
        const content = await Content.find({ grade: parseInt(grade) });
        res.json({ content });
    } catch (err) {
        console.error('Error fetching content by grade:', err);
        res.status(500).json({ msg: 'Server error fetching content.' });
    }
});

router.get('/my-timetable', auth, isTrainerOrAdmin, async (req, res) => {
    try {
        const trainerId = req.user.id;
        const trainer = await User.findById(trainerId).select('assignedSchools assignedGrades');

        if (!trainer) {
            return res.status(404).json({ msg: 'Trainer not found.' });
        }
        const schoolNamesToQuery = trainer.assignedSchools;
        const schools = await School.find({ schoolName: { $in: schoolNamesToQuery } }).select('_id');
        const schoolIds = schools.map(s => s._id);

        if (schoolIds.length === 0) {
            return res.status(200).json({ timetables: [], msg: 'No valid schools found for this trainer.' });
        }
        const timetables = await Timetable.find({
            school: { $in: schoolIds },
            grade: { $in: trainer.assignedGrades }
        })
        .populate('school', 'schoolName')
        .populate({
            path: 'schedule.trainer',
            select: 'name'
        });

        const filteredTimetables = timetables.map(timetable => {
            const filteredSchedule = timetable.schedule.filter(entry =>
                entry.trainer && entry.trainer._id.equals(trainerId)
            );
            return {
                _id: timetable._id,
                school: timetable.school,
                grade: timetable.grade,
                schedule: filteredSchedule,
                createdAt: timetable.createdAt,
                updatedAt: timetable.updatedAt
            };
        }).filter(t => t.schedule.length > 0);

        res.json({ success: true, timetables: filteredTimetables });
    } catch (err) {
        console.error('Error fetching trainer timetable:', err);
        res.status(500).json({ msg: 'Server Error fetching timetable.' });
    }
});

// --- ATTENDANCE ROUTES ---

// For Student Attendance
router.get('/my-assigned-students', auth, isTrainerOrAdmin, getMyAssignedStudents);
router.post('/attendance/mark', auth, isTrainerOrAdmin, markAttendance); // Student attendance route
router.get('/attendance/view', auth, isTrainerOrAdmin, viewAttendance);
router.get('/students/:studentId/attendance', auth, isTrainerOrAdmin, getStudentAttendanceHistory);

// For Trainer Attendance
router.post('/trainer-attendance/mark', auth, isTrainerOrAdmin, markTrainerAttendance); // Trainer attendance route
router.post('/attendance-requests/request', auth, isTrainerOrAdmin, requestTrainerAttendance);
router.get('/attendance-requests/my-requests', auth, isTrainerOrAdmin, getMyTrainerAttendanceRequests);
router.get('/attendance-history', auth, isTrainerOrAdmin, getMyTrainerAttendanceHistory);

// --- QUIZ & FEEDBACK ROUTES ---
router.post('/submit-feedback-to-admin', auth, isTrainerOrAdmin, submitFeedbackToAdmin);
router.get('/trainer/sessions/:sessionId/sections/:section/quizzes/:quizId/results', auth, quizController.getTrainerQuizReports);
router.get('/grades/:gradeId/sessions/:sessionId/quizzes', auth, isTrainerOrAdmin, quizController.getQuizzesForTrainerByGradeAndSession);
router.get('/sessions/:sessionId/sections/:section/quizzes/:quizId/results', auth, quizController.getTrainerQuizReports);
router.get('/student-quiz-detail/:quizId/:attemptId', auth, isTrainerOrAdmin, quizController.getDetailedStudentQuizResultForTrainer);

module.exports = router;