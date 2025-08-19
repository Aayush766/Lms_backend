const express = require('express');
const router = express.Router();
const { auth, isAdmin, isTrainerOrAdmin } = require('../middleware/authMiddleware');
const {
    addClassDetails,
    getMyClassDetails,
    getAllClassDetails,
    getLast24HrsClassDetails,
    updateClassDetails, // You need to import this function
    uploadClassAttachments
} = require('../controllers/classDetailsController');

// @route   POST /api/v1/class-details
// @desc    Add new class details
// @access  Private (Trainer)
router.post('/class-details', auth, isTrainerOrAdmin, uploadClassAttachments, addClassDetails);

// @route   GET /api/v1/class-details/my
// @desc    Get class details for the logged-in trainer
// @access  Private (Trainer)
router.get('/class-details/my', auth, isTrainerOrAdmin, getMyClassDetails);

// @route   GET /api/v1/class-details
// @desc    Get all class details (Admin only)
// @access  Private (Admin)
router.get('/class-details', auth, isAdmin, getAllClassDetails);

// @route   GET /api/v1/class-details/last24hrs
// @desc    Get all class details submitted in the last 24 hours
// @access  Private (Trainer)
router.get('/class-details/last24hrs', auth, isTrainerOrAdmin, getLast24HrsClassDetails);

// @route   PUT /api/v1/class-details/:id
// @desc    Update a specific class detail report
// @access  Private (Trainer)
router.put('/class-details/:id', auth, isTrainerOrAdmin, updateClassDetails); // Add this route

module.exports = router;