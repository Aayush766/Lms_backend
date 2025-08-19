// backend/models/TrainerToAdminFeedback.js
const mongoose = require('mongoose');

const TrainerToAdminFeedbackSchema = mongoose.Schema(
    {
        submittedByTrainer: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User', // Reference to the User model (the trainer)
        },
        submittedByTrainerName: {
            type: String,
            required: true,
        },
        submittedBySchoolName: {
            type: String,
            required: false, // Trainer might not always have an assigned school, depending on your data
        },
        lessonPlanSuggestion: {
            type: String,
            default: '',
        },
        logbookSuggestion: {
            type: String,
            default: '',
        },
        otherSuggestion: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt fields automatically
    }
);

module.exports = mongoose.model('TrainerToAdminFeedback', TrainerToAdminFeedbackSchema);