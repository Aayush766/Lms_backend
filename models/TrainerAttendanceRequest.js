const mongoose = require('mongoose');

const trainerAttendanceRequestSchema = new mongoose.Schema({
    trainer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        validate: {
            validator: async function(v) {
                const user = await mongoose.model('User').findById(v);
                return user && user.role === 'trainer';
            },
            message: props => `${props.value} is not a valid trainer ID.`
        }
    },
    date: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    requestType: {
        type: String,
        required: true,
        enum: ['lateArrival', 'earlyDeparture', 'absence'],
    },
    // FIX: ADD THE 'time' FIELD TO THE SCHEMA
    time: { 
        type: String, 
        required: function() { 
            return this.requestType === 'lateArrival' || this.requestType === 'earlyDeparture';
        }
    },
    remarks: { 
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    adminRemarks: { 
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    reviewedBy: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    }
}, { timestamps: true });

// Ensure a trainer can only request attendance for a specific date once
trainerAttendanceRequestSchema.index({ trainer: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TrainerAttendanceRequest', trainerAttendanceRequestSchema);
