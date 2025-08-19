const mongoose = require('mongoose');

const assignedSessionSchema = new mongoose.Schema({
   school: {
            type: String, // Or mongoose.Schema.Types.ObjectId if you have a separate School model
            required: true, // Make it required, or handle its absence if optional
        },
    grade: {
        type: Number,
        required: [true, 'Grade is required'],
        min: [1, 'Grade must be at least 1']
    },
    // New field for 'section' (Boys/Girls) - Removed 'Both' from enum
    // as controller logic will create separate records for 'Both'
    section: {
        type: String,
        enum: ['Boys', 'Girls'], // Enforce specific values, 'Both' is handled at controller level
        required: [true, 'Section (Boys/Girls) is required'],
    },
    month: {
        // Storing as YYYY-MM string for simplicity in queries/display
        type: String,
        required: [true, 'Month is required'],
        match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format']
    },
    sessions: [
        {
            sessionNumber: {
                type: Number,
                required: [true, 'Session number is required'],
                min: [1, 'Session number must be at least 1']
            },
            sessionTitle: {
                type: String,
                default: 'Default Session Title',
                trim: true
            },
            trainer: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User', // Assuming your User model holds trainers
                required: false, // Trainer is no longer required for initial assignment
                default: null
            },
            isCompleted: {
                type: Boolean,
                default: false
            },
            completedBy: { // To track which trainer completed it
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            completionDate: {
                type: Date,
                default: null
            }
        }
    ],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // The admin who assigned the session
        required: true
    },
}, {
    timestamps: true // Adds createdAt and updatedAt automatically.
});

// Ensure unique combination of school, grade, section, and month
assignedSessionSchema.index({ school: 1, grade: 1, section: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('AssignedSession', assignedSessionSchema);