// backendUp/routes/progressRoutes.js
const express = require('express');
const router = express.Router();
const { auth, isAdmin, isTrainerOrAdmin } = require('../middleware/authMiddleware'); // <--- Suspect 1
const {
    recordProgress,        // <--- Suspect 2
    getDailyProgressReports,
    getMonthlyProgressReports
} = require('../controllers/progressController'); // Correctly imports from the controller file

// @route   POST /api/v1/progress
// @desc    Record or update progress for a specific grade, section, subject by a trainer
// @access  Private (Trainer)
router.post('/progress', auth, isTrainerOrAdmin, recordProgress); 

// @route   GET /api/v1/reports/daily
// @desc    Get daily progress reports for all trainers (Admin view)
// @access  Private (Admin)
router.get('/reports/daily', auth, isAdmin, getDailyProgressReports);

// @route   GET /api/v1/reports/monthly
// @desc    Get monthly progress reports for all trainers (Admin view)
// @access  Private (Admin)
router.get('/reports/monthly', auth, isAdmin, getMonthlyProgressReports);

module.exports = router;