const Holiday = require('../models/Holiday');

// Helper to normalize date to the start of the day in UTC
const normalizeDate = (dateString) => {
    const date = new Date(dateString);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

// @desc    Create a new holiday
// @route   POST /api/admin/holidays
// @access  Private (Admin)
exports.createHoliday = async (req, res) => {
    try {
        const { date, description } = req.body;

        if (!date || !description) {
            return res.status(400).json({ msg: 'Please provide both a date and a description for the holiday.' });
        }

        const normalizedDate = normalizeDate(date);

        const existingHoliday = await Holiday.findOne({ date: normalizedDate });
        if (existingHoliday) {
            return res.status(409).json({ msg: 'A holiday for this date already exists.' });
        }

        const holiday = new Holiday({
            date: normalizedDate,
            description,
        });

        await holiday.save();
        res.status(201).json({ msg: 'Holiday created successfully', holiday });
    } catch (err) {
        console.error('Error creating holiday:', err);
        res.status(500).json({ msg: 'Server error while creating holiday.' });
    }
};

// @desc    Get all holidays
// @route   GET /api/holidays (for users) and GET /api/admin/holidays (for admin)
// @access  Private
exports.getAllHolidays = async (req, res) => {
    try {
        const holidays = await Holiday.find().sort({ date: 'asc' });
        res.status(200).json(holidays);
    } catch (err) {
        console.error('Error fetching holidays:', err);
        res.status(500).json({ msg: 'Server error while fetching holidays.' });
    }
};

// @desc    Delete a holiday
// @route   DELETE /api/admin/holidays/:id
// @access  Private (Admin)
exports.deleteHoliday = async (req, res) => {
    try {
        const holiday = await Holiday.findById(req.params.id);

        if (!holiday) {
            return res.status(404).json({ msg: 'Holiday not found.' });
        }

        await holiday.deleteOne();
        res.status(200).json({ msg: 'Holiday removed successfully.' });
    } catch (err) {
        console.error('Error deleting holiday:', err);
        res.status(500).json({ msg: 'Server error while deleting holiday.' });
    }
};