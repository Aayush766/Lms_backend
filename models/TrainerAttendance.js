// models/TrainerAttendance.js

const mongoose = require('mongoose');

const TrainerAttendanceSchema = new mongoose.Schema({
    trainer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Photo is NOT required, as it's only for 'mark present'
    photo: {
        type: String, 
    },
    // Location is NOT required, as it's only for 'mark present'
    location: {
        latitude: {
            type: Number,
        },
        longitude: {
            type: Number,
        },
    },
    status: {
        type: String,
        // The enum already supports the required statuses
        enum: ['Pending', 'Approved', 'Rejected', 'P', 'L', 'A'], 
        default: 'Pending'
    },
    // This field is crucial for associating the record with a specific day
    date: {
        type: Date,
        required: true,
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    reviewedAt: {
        type: Date,
    },
    adminRemarks: {
        type: String,
    },
}, { timestamps: true });

// Ensure a trainer has only one attendance record per day
TrainerAttendanceSchema.index({ trainer: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TrainerAttendance', TrainerAttendanceSchema);