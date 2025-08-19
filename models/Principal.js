// models/Principal.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const principalSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    // MODIFIED: Store school as a String (school name)
    school: {
        type: String, // <--- Correct: Storing the school name as a string
        required: true,
        unique: true // Ensure each principal is associated with a unique school name
    },
    contactNumber: {
        type: String,
        required: true,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: true,
    },
    address: {
        type: String,
        required: true,
    },
    dob: {
        type: Date,
        required: true,
    },
    profilePicture: {
        type: String,
    },
}, { timestamps: true });

// Password hashing middleware
principalSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Method to match password
principalSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Principal', principalSchema);