const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    doubtSession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DoubtSession',
        required: true
    },
    sender: { // Refers to the User who sent the message or a pseudo-ID for AI/System
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Can be false if senderRole is 'ai' or 'system' and no User object exists for them
    },
    senderRole: { // To quickly identify sender without populating
        type: String,
        enum: ['student', 'trainer', 'ai', 'system'], // 'system' for automated messages (e.g., "Session started")
        required: true
    },
    messageText: {
        type: String,
        required: function() { return !this.attachmentUrl; } // Either text or attachment must be present
    },
    attachmentUrl: {
        type: String, // URL to the uploaded file in cloud storage
        default: null
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Index for efficient message retrieval within a session
chatMessageSchema.index({ doubtSession: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);