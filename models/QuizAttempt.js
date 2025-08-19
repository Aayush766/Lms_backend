// models/QuizAttempt.js
const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz.questions', // Reference to the specific question in the Quiz model
        required: true
    },
    selectedOption: { // Changed from 'answer' to 'selectedOption' for clarity
        type: String,
        required: true
    }
}, { _id: false }); // Do not create a separate _id for subdocuments if not needed

const QuizAttemptSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    quiz: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true
    },
    attemptNumber: {
        type: Number,
        required: true, // Keep it required, but we'll calculate it in the controller
        min: 1
    },
    score: {
        type: Number,
        required: true,
        default: 0
    },
    totalQuestions: {
        type: Number,
        required: true
    },
    answers: [AnswerSchema], // Array of answers
    startedAt: {
        type: Date,
        required: true
    },
    completedAt: {
        type: Date,
        required: true
    },
    timeTaken: { // Time taken in seconds
        type: Number,
        required: false // Not always required if quiz is untimed or auto-submitted
    },
    timedOut: { // Flag if the quiz was submitted due to timeout
        type: Boolean,
        default: false
    },
    isCompleted: { // Indicates if the attempt was fully completed
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('QuizAttempt', QuizAttemptSchema);