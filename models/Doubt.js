// models/Doubt.js

const mongoose = require('mongoose'); // Make sure mongoose is imported

// 1. Declare and define doubtSessionSchema using 'const'
// This is where 'doubtSessionSchema' comes into existence.
const doubtSessionSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    trainer: { // Nullable for AI doubts
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    grade: { // To easily filter doubts by grade without populating student
        type: Number,
        required: true
    },
    school: { // To easily filter doubts by school without populating student
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    session: { // Which academic session/topic the doubt relates to (from the sessions array in the Session model)
        type: mongoose.Schema.Types.ObjectId, // This will store the _id of the specific session object within the Session document
        ref: 'Session',
        required: function() { return this.doubtType === 'trainer'; } // Required for trainer doubts for context
    },
    initialDoubtText: {
        type: String,
        required: true,
        trim: true
    },
    doubtType: {
        type: String,
        enum: ['trainer', 'ai'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'resolved', 'closed', 'cancelled'],
        default: 'pending' // 'pending' for trainer doubts, 'resolved' for AI after initial answer
    },
    lastMessageAt: { // To sort by most recent activity
        type: Date,
        default: Date.now
    },
    // For AI feedback
    aiHelpful: {
        type: Boolean,
        default: null // true, false, or null if no feedback given
    },
    aiFeedbackText: {
        type: String,
        trim: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// 2. Call methods on the 'doubtSessionSchema' instance.
// These lines MUST come AFTER the 'const doubtSessionSchema = ...' declaration.
// If your file is called 'Doubt.js' as per the error, ensure this entire block
// is inside that file.
doubtSessionSchema.index({ student: 1, status: 1 });
doubtSessionSchema.index({ trainer: 1, status: 1 });
doubtSessionSchema.index({ doubtType: 1, status: 1 });


// 3. Export the compiled Mongoose model.
// This is the very last step in the file.
module.exports = mongoose.model('DoubtSession', doubtSessionSchema);