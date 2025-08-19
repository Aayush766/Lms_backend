// models/Content.js
const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: {
        type: String,
        required: true,
        enum: [
            'ebook',
            'video',
            'quiz_link', // Changed from 'quiz' to 'quiz_link' to clearly indicate it's a link
            'course_description', // New: For course descriptions
            'announcement',       // New: For announcements
            'feedback_text',      // New: For general text feedback for a grade/session
            'code_snippet',       // New: For code content
            'assessment',         // New: For assessments
            'project'             // New: For projects
        ]
    },
    fileUrl: { type: String }, // For 'ebook', 'video', and potentially code (pdf/xml)
    videoList: [ // Array for external video resources (might still be used for links)
        {
            id: { type: String },
            title: { type: String },
            thumbnail: { type: String },
        }
    ],
    // Quiz related fields
    quiz: { // Reference to a separate Quiz document (assuming a Quiz model exists)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: false // Not always required, only if type is 'quiz_link'
    },
    quizTiming: { // New: 'before', 'during', 'after', 'any'
        type: String,
        enum: ['before', 'during', 'after', 'any'],
        required: function() { return this.type === 'quiz_link'; }
    },

    // Code Snippet related fields
    codeContent: { // New: Stores direct text code or a reference/path
        type: String,
        required: function() { return this.type === 'code_snippet'; }
    },
    codeFormat: { // New: 'pdf', 'xml', 'text', 'vs_code_link'
        type: String,
        enum: ['pdf', 'xml', 'text', 'vs_code_link'], // vs_code_link for external hosting or integrated viewer
        required: function() { return this.type === 'code_snippet'; }
    },
    codeTiming: { // New: 'before', 'during', 'after', 'any'
        type: String,
        enum: ['before', 'during', 'after', 'any'],
        required: function() { return this.type === 'code_snippet'; }
    },

    // General text content for Course Description, Announcement, Feedback
    textContent: {
        type: String,
        required: function() {
            return ['course_description', 'announcement', 'feedback_text', 'assessment', 'project'].includes(this.type);
        }
    },

    // Assessment and Project specific fields
    // For simplicity, using textContent for their format/description.
    // In a real app, these might link to separate "Assessment" or "Project" models
    // with rich text editors or file uploads for templates/rubrics.
    // assessmentFormat: { type: String }, // e.g., 'editable_markdown', 'pdf_template'
    // projectFormat: { type: String },    // e.g., 'editable_markdown', 'pdf_template'

    grade: { type: Number, required: true },
    session: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true
});

module.exports = mongoose.model('Content', contentSchema);