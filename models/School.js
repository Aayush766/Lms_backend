// models/School.js
const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
    grade: {
        type: String,
        required: true,
        trim: true
    },
    sections: {
        type: [String],
        default: [],
        trim: true
    }
}, { _id: false }); // Do not create an _id for subdocuments

const schoolSchema = new mongoose.Schema({
    schoolName: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    schoolCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    address: {
        type: String,
        required: true,
        trim: true
    },
    city: {
        type: String,
        required: true,
        trim: true
    },
    schoolCoordinatorName: {
        type: String,
        required: true,
        trim: true
    },
    schoolCoordinatorContact: {
        type: String, // Consider validating as a phone number if strict format is needed
        required: true,
        trim: true
    },
    schoolPrincipalName: {
        type: String,
        required: true,
        trim: true
    },
    schoolPrincipalContact: {
        type: String, // Consider validating as a phone number
        required: true,
        trim: true
    },
    // --- NEW FIELD FOR SECTIONS ---
      gradesAndSections: {
        type: [sectionSchema], // Array of grade-section objects
        default: []
    }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

module.exports = mongoose.model('School', schoolSchema);