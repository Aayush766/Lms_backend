// models/Quiz.js
const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    questionText: {
        type: String,
        required: true,
        trim: true
    },
    options: {
        type: [String],
        required: true,
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length >= 2;
            },
            message: props => `${props.value} must contain at least two options!`
        }
    },
    correctAnswer: { // Store the correct answer (should only be exposed to admin)
        type: String,
        required: true
    }
}, { _id: true }); // Ensure subdocuments get an _id

const QuizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    grade: { // Assuming quizzes are associated with a grade level
        type: Number,
        required: true
    },
    session: { // Assuming quizzes are associated with a session number/ID
        type: Number, // Or mongoose.Schema.Types.ObjectId if referencing a Session model
        required: true
    },
    questions: {
        type: [QuestionSchema],
        required: true,
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length > 0;
            },
            message: 'A quiz must have at least one question.'
        }
    },
    attemptsAllowed: {
        type: Number,
        default: 1, // Default to 1 attempt
        min: 1
    },
    timeLimit: { // in minutes
        type: Number,
        default: 60,
        min: 1
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        default: 'Medium'
    },
    category: {
        type: String,
        trim: true,
        default: 'General'
    },
    dueDate: {
        type: Date
    },
    instructions: {
        type: String,
        trim: true
    },
    createdBy: { // Who created the quiz (e.g., admin)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Quiz', QuizSchema);