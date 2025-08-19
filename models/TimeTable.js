// models/TimeTable.js

const mongoose = require('mongoose');

const timetableEntrySchema = new mongoose.Schema({
    day: {
        type: String,
        required: [true, 'Day is required.'],
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    },
    startTime: {
        type: String, // HH:MM format
        // No 'required' here, as it's conditional based on isHoliday
        validate: {
            validator: function(v) {
                // If isHoliday is true, startTime can be empty
                if (this.isHoliday) return true;
                // Otherwise, it must match HH:MM format
                return v && /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/.test(v);
            },
            message: props => `${props.path} must be in HH:MM format if not a holiday.`
        }
    },
    endTime: {
        type: String, // HH:MM format
        // No 'required' here, as it's conditional
        validate: {
            validator: function(v) {
                if (this.isHoliday) return true;
                return v && /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/.test(v);
            },
            message: props => `${props.path} must be in HH:MM format if not a holiday.`
        }
    },
    subject: {
        type: String,
        trim: true,
        // No 'required' here, as it's conditional
        validate: {
            validator: function(v) {
                return this.isHoliday || (v && v.trim().length > 0);
            },
            message: 'Subject is required if not a holiday.'
        }
    },
    trainer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Assuming 'User' is your trainer model
        // No 'required' here, as it's conditional
        validate: {
            validator: function(v) {
                return this.isHoliday || v;
            },
            message: 'Trainer is required if not a holiday.'
        }
    },
    isHoliday: {
        type: Boolean,
        default: false // New field! Initialize to false
    }
}, { _id: true }); // Ensure _id is true if you want each subdocument to have its own _id

// Add a pre-save hook for timetableEntrySchema to clear fields if it's a holiday
timetableEntrySchema.pre('save', function(next) {
    if (this.isHoliday) {
        this.startTime = '';
        this.endTime = '';
        this.subject = '';
        this.trainer = null;
    }
    next();
});

const timetableSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    grade: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    schedule: [timetableEntrySchema]
}, { timestamps: true });

// Add a unique compound index to prevent duplicate timetables for the same school and grade
timetableSchema.index({ school: 1, grade: 1 }, { unique: true });

module.exports = mongoose.model('Timetable', timetableSchema);