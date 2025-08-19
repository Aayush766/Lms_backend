// models/ClassDetails.js (assuming this is your Mongoose model file)
const mongoose = require('mongoose');

const ClassDetailsSchema = mongoose.Schema(
    {
        trainer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Assuming your User model is named 'User'
            required: true,
        },
        grade: {
            type: Number,
            required: true,
        },
        sessionNumber: {
            type: Number,
            required: true,
        },
        sessionTitle: {
            type: String,
            required: true,
        },
        studentsCount: {
            type: Number,
            required: true,
        },
        learningOutcome: {
            type: String,
            required: true,
        },
        remarks: {
            type: String,
            default: '',
        },
        date: {
            type: Date,
            required: true,
            default: Date.now,
        },
        attachedFiles: [
            {
                type: String, // URLs to uploaded files
            },
        ],
        // New field for school
        school: {
            type: String, // Or mongoose.Schema.Types.ObjectId if you have a separate School model
            required: true, // Make it required, or handle its absence if optional
        },
         section: {
            type: String,
            enum: ['Boys', 'Girls'], // Enforce these two options
            required: true,
        },
         weekNumber: {
            type: String, // Storing as a string like "Week 1", "Week 2"
            required: false, // Make it required if you want every entry to have it
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt fields
    }
);

module.exports = mongoose.model('ClassDetails', ClassDetailsSchema);