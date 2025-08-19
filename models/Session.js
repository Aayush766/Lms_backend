// models/Session.js
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    grade: { type: Number, required: true, unique: true },
    sessions: [ // Array of session objects
        {
            sessionNumber: { type: Number, required: true },
            name: { type: String, required: true },
            topicName: { type: String, required: true },
            progress: { type: Number, default: 0 } // ADD THIS LINE if you want to store progress
        }
    ]
});

module.exports = mongoose.model('Session', sessionSchema);