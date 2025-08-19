// routes/assignedSessionRoutes.js
const express = require('express');
const router = express.Router();
const { auth, isAdmin } = require('../middleware/authMiddleware'); // Assuming you have these middleware functions
const {
    assignSessions,
    getAssignedSessions,
    updateAssignedSession,
    deleteAssignedSession,
    getAllTrainers, // Used by frontend for dropdown
    getAllSchools // Used by frontend for dropdown
} = require('../controllers/assignedSessionController');

// All assigned session routes are for Admin only
router.use(auth, isAdmin); // Protect all routes in this file

// @route   POST /api/assigned-sessions
// @desc    Assign sessions for a school, grade, and month
// @access  Private/Admin
router.post('/', assignSessions);

// @route   GET /api/assigned-sessions
// @desc    Get assigned sessions (with filters)
// @access  Private/Admin
router.get('/', getAssignedSessions);

// @route   GET /api/assigned-sessions/trainers
// @desc    Get all trainers (for dropdown in frontend)
// @access  Private/Admin
router.get('/trainers', getAllTrainers); // Separate route for trainers if not already exposed

// @route   GET /api/assigned-sessions/schools
// @desc    Get all schools (for dropdown in frontend)
// @access  Private/Admin
router.get('/schools', getAllSchools); // Separate route for schools if not already exposed

// @route   PUT /api/assigned-sessions/:id
// @desc    Update an existing assigned session
// @access  Private/Admin
router.put('/:id', updateAssignedSession);

// @route   DELETE /api/assigned-sessions/:id
// @desc    Delete an assigned session
// @access  Private/Admin
router.delete('/:id', deleteAssignedSession);

module.exports = router;