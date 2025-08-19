// backend/controllers/trainerFeedbackController.js
const asyncHandler = require('express-async-handler');
const TrainerToAdminFeedback = require('../models/TrainerToAdminFeedback');
const User = require('../models/User'); // Assuming User model is used for trainers

// @desc    Trainer submits feedback to Admin
// @route   POST /api/trainer/submit-feedback-to-admin
// @access  Private (Trainer)
exports.submitFeedbackToAdmin = asyncHandler(async (req, res) => {
    // req.user will be populated by the 'auth' middleware
    const trainerId = req.user.id;
    const trainerRole = req.user.role;

    if (trainerRole !== 'trainer') {
        res.status(403);
        throw new Error('Access denied. Only trainers can submit this feedback.');
    }

    const {
        lessonPlanSuggestion,
        logbookSuggestion,
        otherSuggestion
    } = req.body;

    // Fetch trainer's name and school(s) from the database
    const trainer = await User.findById(trainerId).select('name assignedSchools school');

    if (!trainer) {
        res.status(404);
        throw new Error('Trainer profile not found.');
    }

    // Client-side validation is good, but backend should also ensure at least one field is provided
    if (!lessonPlanSuggestion && !logbookSuggestion && !otherSuggestion) {
        res.status(400);
        throw new Error('Please provide at least one suggestion (Lesson Plan, Logbook, or Other Suggestion).');
    }

    let submittedBySchoolName;
    if (trainer.assignedSchools && trainer.assignedSchools.length > 0) {
        submittedBySchoolName = trainer.assignedSchools[0]; // Or trainer.assignedSchools.join(', ') if multiple
    } else if (trainer.school) { // If 'school' is a singular field
        submittedBySchoolName = trainer.school;
    } else {
        submittedBySchoolName = 'N/A'; // Default if no school info available
    }

    const feedback = await TrainerToAdminFeedback.create({
        submittedByTrainer: trainerId,
        submittedByTrainerName: trainer.name,
        submittedBySchoolName: submittedBySchoolName,
        lessonPlanSuggestion,
        logbookSuggestion,
        otherSuggestion,
    });

    res.status(201).json({
        message: 'Feedback submitted successfully to admin.',
        feedbackId: feedback._id,
    });
});

// If an admin needs to VIEW trainer-to-admin feedback, that function would go here as well:
exports.getTrainerToAdminFeedback = asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Access denied. Only administrators can view this feedback.');
    }
    const feedbackEntries = await TrainerToAdminFeedback.find({})
        .populate('submittedByTrainer', 'name email')
        .sort({ createdAt: -1 });
    res.status(200).json({ success: true, feedback: feedbackEntries });
});
