// backend/models/TrainerFeedback.js
const mongoose = require('mongoose');

const TrainerFeedbackSchema = new mongoose.Schema({
    // The admin who submitted the feedback
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model (assuming admin is a 'User')
        required: true,
    },
    submittedByName: { // To easily display the admin's name
        type: String,
        required: true,
    },
    // The trainer this feedback is about
    trainer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model for the trainer
        required: true,
    },
    trainerName: { // To easily display the trainer's name
        type: String,
        required: true,
    },
    schoolName: {
        type: String,
        required: true,
        trim: true,
    },
    lessonPlanSuggestion: {
        type: String,
        trim: true,
        default: '',
    },
    logbookSuggestion: {
        type: String,
        trim: true,
        default: '',
    },
    otherSuggestion: {
        type: String,
        trim: true,
        default: '',
    },
}, { timestamps: true }); // 'timestamps: true' will add createdAt and updatedAt automatically

module.exports = mongoose.model('TrainerFeedback', TrainerFeedbackSchema);