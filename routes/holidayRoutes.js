const express = require('express');
const router = express.Router();
const { getAllHolidays } = require('../controllers/holidayController');
const { auth } = require('../middleware/authMiddleware');

// @desc    Get all holidays for display on calendars
// @route   GET /api/holidays
// @access  Private (any logged-in user)
router.get('/', auth, getAllHolidays);

module.exports = router;