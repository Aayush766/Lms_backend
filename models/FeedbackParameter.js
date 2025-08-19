// models/FeedbackParameter.js
const mongoose = require('mongoose');

const FeedbackParameterSchema = new mongoose.Schema({
    question: {
        type: String,
        required: [true, 'A feedback question is required.'],
        trim: true,
        unique: true, // Ensure no duplicate questions
    },
    // You could add more fields here, like a category or a description
    // category: {
    //     type: String,
    //     enum: ['Teaching', 'Environment', 'Support'],
    //     default: 'Teaching'
    // },
    isDefault: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('FeedbackParameter', FeedbackParameterSchema);