// backendUp/controllers/progressController.js
const Progress = require('../models/Progress'); // Import the Progress model
const User = require('../models/User'); // Import the User model to get trainer names
const moment = require('moment'); // For easy date manipulation

// @desc    Record new progress for a subject
// @route   POST /api/v1/progress
// @access  Private (Trainer)
exports.recordProgress = async (req, res) => {
    // Assuming trainer ID is available from auth middleware (req.user.id)
    const { grade, section, subject, progressPercentage } = req.body;
    const trainerId = req.user.id; // Trainer's ID from JWT token

    if (!grade || !section || !subject || progressPercentage === undefined) {
        return res.status(400).json({ msg: 'Please enter all required fields: grade, section, subject, and progress percentage.' });
    }

    try {
        // Find the existing progress entry for the current trainer, grade, section, and subject
        // This prevents creating duplicate entries for the same combination on subsequent updates
        let progressEntry = await Progress.findOneAndUpdate(
            {
                trainer: trainerId,
                grade,
                section,
                subject
            },
            {
                progressPercentage,
                // We update `updatedAt` automatically due to `timestamps: true` in schema
            },
            {
                new: true, // Return the updated document
                upsert: true, // Create a new document if one doesn't exist
                setDefaultsOnInsert: true // Apply schema defaults when upserting
            }
        );

        res.status(201).json({ msg: 'Progress recorded/updated successfully', progressEntry });

    } catch (err) {
        console.error('Error recording progress:', err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get daily progress reports for all trainers
// @route   GET /api/v1/reports/daily
// @access  Private (Admin)
exports.getDailyProgressReports = async (req, res) => {
    const { date } = req.query; // Expects date in YYYY-MM-DD format
    const queryDate = date ? moment.utc(date).startOf('day') : moment.utc().startOf('day');
    const nextDay = moment.utc(queryDate).add(1, 'days');

    try {
        const progressEntries = await Progress.find({
            createdAt: { // Or `updatedAt` if you want to filter by the last update date
                $gte: queryDate.toDate(),
                $lt: nextDay.toDate()
            }
        }).populate('trainer', 'name'); // Populate trainer's name

        // Group progress by trainer
        const reports = {};
        progressEntries.forEach(entry => {
            const trainerId = entry.trainer._id.toString();
            if (!reports[trainerId]) {
                reports[trainerId] = {
                    trainerName: entry.trainer.name,
                    trainerId: trainerId,
                    date: queryDate.format('YYYY-MM-DD'),
                    dailyProgress: []
                };
            }
            reports[trainerId].dailyProgress.push({
                grade: entry.grade,
                section: entry.section,
                subject: entry.subject,
                progressPercentage: entry.progressPercentage,
                updatedAt: entry.updatedAt // Or createdAt, depending on what you want to show
            });
        });

        res.json(Object.values(reports)); // Return as an array of reports
    } catch (err) {
        console.error('Error fetching daily reports:', err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get monthly progress reports for all trainers
// @route   GET /api/v1/reports/monthly
// @access  Private (Admin)
exports.getMonthlyProgressReports = async (req, res) => {
    const { year, month } = req.query; // Expects year (e.g., 2025) and month (e.g., 06 for June)

    if (!year || !month) {
        return res.status(400).json({ msg: 'Year and month parameters are required (e.g., ?year=2025&month=06).' });
    }

    const startOfMonth = moment.utc(`${year}-${month}-01`).startOf('month');
    const endOfMonth = moment.utc(startOfMonth).endOf('month');

    try {
        const progressEntries = await Progress.find({
            createdAt: { // Or `updatedAt`
                $gte: startOfMonth.toDate(),
                $lt: endOfMonth.toDate()
            }
        }).populate('trainer', 'name'); // Populate trainer's name

        const reports = {};

        progressEntries.forEach(entry => {
            const trainerId = entry.trainer._id.toString();
            if (!reports[trainerId]) {
                reports[trainerId] = {
                    trainerName: entry.trainer.name,
                    trainerId: trainerId,
                    month: startOfMonth.format('MMMM YYYY'), // Format for display
                    monthlyProgress: {} // Keyed by subject, then grade-section
                };
            }

            const key = `${entry.grade} - ${entry.section}`;
            if (!reports[trainerId].monthlyProgress[entry.subject]) {
                reports[trainerId].monthlyProgress[entry.subject] = {};
            }

            // For monthly reports, we'll just store the latest reported progress for that specific combo within the month.
            // If you need averages, you'd perform an aggregation pipeline in MongoDB.
            reports[trainerId].monthlyProgress[entry.subject][key] = entry.progressPercentage;
        });

        res.json(Object.values(reports)); // Return as an array of reports
    } catch (err) {
        console.error('Error fetching monthly reports:', err.message);
        res.status(500).send('Server Error');
    }
};