// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'onModel' // Dynamic reference based on 'onModel' field
    },
    onModel: { // To distinguish if the userId refers to a 'Student' or 'Trainer' etc.
        type: String,
        required: true,
        enum: ['User', 'Student', 'Trainer', 'Admin'] // <--- ADDED 'User' here
    },
    type: { // e.g., 'attendance', 'doubtReply', 'announcement', 'general'
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    relatedData: { // Optional: for specific data like attendance date/status, doubt ID
        type: mongoose.Schema.Types.Mixed, // Allows flexible data types
        default: {}
    },
    read: {
        type: Boolean,
        default: false,
    },
    createdAt: { // When the notification was created
        type: Date,
        default: Date.now,
    },
    timeAsked: {
        type: Date,
        default: Date.now,
    },
});

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);