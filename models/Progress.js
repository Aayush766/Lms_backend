// backendUp/models/Progress.js
const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
    trainer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to your User model for the trainer
        required: true,
    },
    grade: {
        type: String, // e.g., 'Grade 1', 'Grade 5'
        required: true,
    },
    section: {
        type: String, // e.g., 'Section A', 'Section B'
        required: true,
    },
    subject: {
        type: String, // e.g., 'Maths', 'Science'
        required: true,
    },
    progressPercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
    },
    // You might want to store specific chapter/topic if your frontend tracks that more granularly
    // chapter: {
    //     type: String,
    //     required: false
    // }
}, {
    timestamps: true // Adds createdAt and updatedAt fields automatically
});

module.exports = mongoose.model('Progress', progressSchema); // Export only the Mongoose model