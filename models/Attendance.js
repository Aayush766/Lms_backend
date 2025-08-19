const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        // Ensure that the referenced user is a student
        validate: {
            validator: async function(v) {
                // 'this' refers to the document being validated.
                // Using mongoose.model('User') to prevent circular dependency if User model also references Attendance.
                const user = await mongoose.model('User').findById(v);
                return user && user.role === 'student';
            },
            message: props => `${props.value} is not a valid student ID.`
        }
    },
    trainer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        // Ensure that the referenced user is a trainer
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
        // No default: Date.now if 'date' is always provided by the request body
        // If it's *sometimes* not provided and should default to today, then keep it.
        // Given your controller logic, it seems 'date' is always provided.
    },
    grade: {
        type: Number,
        required: true,
        min: 1
    },
    school: { // <--- ADDED THIS FIELD
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['Present', 'Absent', 'Late', 'Excused'],
        default: 'Present'
    },
    // Optional: add a field for the session if attendance is session-specific
    // session: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'Session'
    // },
    remarks: {
        type: String,
        trim: true,
        maxlength: 250,
        default: '' // Good practice to default remarks to an empty string to avoid null issues
    }
}, { timestamps: true });

// Ensure a unique attendance record for a specific student, trainer, grade, school, on a specific date.
// This aligns with the `findOneAndUpdate` query in `markAttendance` controller.
attendanceSchema.index({ student: 1, date: 1, trainer: 1, grade: 1, school: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);