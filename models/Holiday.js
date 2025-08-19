const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        unique: true, // Prevents duplicate holidays on the same date
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Holiday', holidaySchema);