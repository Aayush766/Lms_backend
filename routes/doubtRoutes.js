// backendUp/routes/doubtRoutes.js
const express = require('express');
const router = express.Router();
const { auth, isStudent, isTrainerOrAdmin, isAdmin, isParticipantInDoubtSession } = require('../middleware/authMiddleware');
const {
    uploadDoubtAttachment,
    getAvailableTrainers,
    getSessionsForGrade,
    initiateDoubtSession,
    getDoubtSessionMessages,
    sendDoubtMessage,
    closeDoubtSession,
    getMyDoubtSessions,
    getTrainerDoubtSessions,
    getAllDoubtSessions,
    submitAiFeedback,
    getActiveStudentDoubts
} = require('../controllers/doubtController');

// --- File Upload for Doubt Attachments ---
router.post('/upload-attachment', auth, uploadDoubtAttachment);

// --- Student Routes ---
router.get('/trainers', auth, isStudent, getAvailableTrainers);
router.get('/sessions-for-grade/:grade', auth, isStudent, getSessionsForGrade);
router.post('/initiate', auth, isStudent, initiateDoubtSession);
router.get('/my-doubts', auth, isStudent, getMyDoubtSessions);
router.post('/:doubtSessionId/feedback/ai', auth, isStudent, submitAiFeedback);
router.get('/student/active', auth, isStudent, getActiveStudentDoubts);

// --- Trainer Routes ---
router.get('/trainer/my-doubts', auth, isTrainerOrAdmin, getTrainerDoubtSessions); // Assumes isTrainerOrAdmin correctly includes Trainer role

// --- Common Routes for Participants (Student & Trainer) ---
router.get('/:doubtSessionId/messages', auth, isParticipantInDoubtSession, getDoubtSessionMessages);
router.post('/:doubtSessionId/messages', auth, isParticipantInDoubtSession, sendDoubtMessage);
router.put('/:doubtSessionId/close', auth, isParticipantInDoubtSession, closeDoubtSession);

// --- Admin Routes ---
router.get('/admin/all-doubts', auth, isAdmin, getAllDoubtSessions);

module.exports = router;