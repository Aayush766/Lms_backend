// controllers/timetableController.js

const mongoose = require('mongoose');
const Timetable = require('../models/TimeTable');
const School = require('../models/School'); // Assuming School model exists
const User = require('../models/User'); // Assuming User model for trainers

// Helper function to convert HH:MM string to minutes for comparison
const timeToMinutes = (time) => {
    if (!time || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
        return -1; // Indicate invalid time
    }
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

// Helper function for time format validation
const isValidTimeFormat = (time) => {
    return typeof time === 'string' && /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/.test(time);
};

// @desc    Get timetable for a specific school and grade
// @route   GET /api/admin/schools/:schoolId/grades/:grade/timetable
// @access  Private (Admin, or other roles who can view timetables)
exports.getTimetableBySchoolAndGrade = async (req, res) => {
    try {
        const { schoolId, grade } = req.params;

        // Validate schoolId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({ msg: 'Invalid School ID format.' });
        }

        const timetable = await Timetable.findOne({ school: schoolId, grade: parseInt(grade) })
            .populate('school', 'schoolName')
            .populate({
                path: 'schedule.trainer',
                select: 'name' // Populate trainer name within schedule entries
            });

        if (!timetable) {
            return res.status(404).json({ msg: 'Timetable not found for this school and grade.' });
        }

        res.json({ success: true, timetable });
    } catch (err) {
        console.error('Error fetching timetable:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Edit/Create timetable for a specific school and grade
// @route   PUT /api/admin/schools/:schoolId/grades/:grade/timetable
// @access  Private (Admin)
exports.editTimetableBySchoolAndGrade = async (req, res) => {
    try {
        const { schoolId, grade } = req.params;
        let { schedule } = req.body; // schedule should be an array of timetableEntrySchema objects

        // Validate schoolId and grade
        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({ msg: 'Invalid School ID format.' });
        }
        if (isNaN(parseInt(grade)) || parseInt(grade) < 1 || parseInt(grade) > 12) {
            return res.status(400).json({ msg: 'Grade must be a number between 1 and 12.' });
        }

        // Check if school exists
        const schoolExists = await School.findById(schoolId);
        if (!schoolExists) {
            return res.status(404).json({ msg: 'School not found.' });
        }

        if (!Array.isArray(schedule)) {
            return res.status(400).json({ msg: 'Schedule must be an array.' });
        }

        const validationErrors = [];
        const trainersToValidate = new Set();
        const dailySlots = {}; // To check for overlaps: { 'Monday': [{start: 900, end: 1000}, ...] }

        // Pre-process and validate each entry in the schedule
        // Important: Create a new array to modify entries safely for processing
        const processedSchedule = schedule.map(entry => {
            const newEntry = { ...entry }; // Clone the entry to avoid modifying original req.body directly
            // Ensure isHoliday is a boolean, default to false if not provided
            newEntry.isHoliday = typeof newEntry.isHoliday === 'boolean' ? newEntry.isHoliday : false;
            return newEntry;
        });

        for (let i = 0; i < processedSchedule.length; i++) {
            const entry = processedSchedule[i];

            // 1. Basic field presence and type validation
            if (!entry.day) {
                validationErrors.push(`Entry ${i + 1}: Day is required.`);
                continue;
            }
            if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(entry.day)) {
                validationErrors.push(`Entry ${i + 1}: Invalid day '${entry.day}'.`);
                continue;
            }

            if (entry.isHoliday) {
                // For holidays, other fields are not required and can be empty/null
                // Clear them to ensure clean data if frontend sends them for holidays.
                // This is also handled by Mongoose pre-save hook, but good to be explicit here too.
                entry.startTime = '';
                entry.endTime = '';
                entry.subject = '';
                entry.trainer = null;
                continue; // Skip further validation for holiday entries
            }

            // 2. Validation for non-holiday entries
            if (!entry.startTime || !entry.endTime || !entry.subject || !entry.trainer) {
                validationErrors.push(`Entry ${i + 1} on ${entry.day}: startTime, endTime, subject, and trainer are required for non-holiday entries.`);
                continue;
            }

            // 3. Time format validation (HH:MM)
            if (!isValidTimeFormat(entry.startTime)) {
                validationErrors.push(`Entry ${i + 1} on ${entry.day}: Invalid start time format '${entry.startTime}'. Must be HH:MM.`);
                continue;
            }
            if (!isValidTimeFormat(entry.endTime)) {
                validationErrors.push(`Entry ${i + 1} on ${entry.day}: Invalid end time format '${entry.endTime}'. Must be HH:MM.`);
                continue;
            }

            const startMinutes = timeToMinutes(entry.startTime);
            const endMinutes = timeToMinutes(entry.endTime);

            // This check also covers if timeToMinutes returned -1 due to invalid format (already checked by isValidTimeFormat)
            if (startMinutes === -1 || endMinutes === -1) {
                validationErrors.push(`Entry ${i + 1} on ${entry.day}: Time conversion error.`);
                continue;
            }

            // 4. Time logic validation (start < end)
            if (startMinutes >= endMinutes) {
                validationErrors.push(`Entry ${i + 1} on ${entry.day}: End time (${entry.endTime}) must be after start time (${entry.startTime}).`);
                continue;
            }

            // 5. Overlap detection for the current day
            if (!dailySlots[entry.day]) {
                dailySlots[entry.day] = [];
            }
            const hasOverlap = dailySlots[entry.day].some(existingSlot =>
                (startMinutes < existingSlot.end && endMinutes > existingSlot.start)
            );

            if (hasOverlap) {
                validationErrors.push(`Entry ${i + 1} on ${entry.day}: Class from ${entry.startTime} to ${entry.endTime} on ${entry.day} overlaps with another class in this submission.`);
                continue;
            }
            dailySlots[entry.day].push({ start: startMinutes, end: endMinutes });

            // Collect trainer IDs for batch validation, ensuring it's a valid ObjectId
            if (!mongoose.Types.ObjectId.isValid(entry.trainer)) {
                validationErrors.push(`Entry ${i + 1} on ${entry.day}: Invalid trainer ID format.`);
                continue;
            }
            trainersToValidate.add(entry.trainer.toString());
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({ msg: 'Validation errors in schedule', errors: validationErrors });
        }

        // 6. Validate trainer IDs against the database (only if there are trainers to check)
        if (trainersToValidate.size > 0) {
            const existingTrainers = await User.find({
                _id: { $in: Array.from(trainersToValidate) },
                role: 'trainer' // Ensure the user is a trainer
            }).select('_id');

            const existingTrainerIds = new Set(existingTrainers.map(t => t._id.toString()));

            for (const trainerId of Array.from(trainersToValidate)) {
                if (!existingTrainerIds.has(trainerId)) {
                    validationErrors.push(`Trainer with ID ${trainerId} not found or is not a trainer.`);
                }
            }
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({ msg: 'Validation errors:', errors: validationErrors });
        }

        // Convert trainer IDs to Mongoose ObjectIds for saving
        // Also, remove tempId if it exists, as it's a frontend-only property
        const finalSchedule = processedSchedule.map(entry => {
            const { tempId, ...rest } = entry; // Destructure to exclude tempId
            return {
                ...rest,
                trainer: entry.trainer ? new mongoose.Types.ObjectId(entry.trainer) : null
            };
        });

        const timetable = await Timetable.findOneAndUpdate(
            { school: schoolId, grade: parseInt(grade) },
            { schedule: finalSchedule },
            { new: true, upsert: true, runValidators: true } // upsert: create if not found, runValidators: apply schema validators
        )
            .populate('school', 'schoolName')
            .populate({
                path: 'schedule.trainer',
                select: 'name'
            });

        res.json({ success: true, msg: 'Timetable updated successfully', timetable });
    } catch (err) {
        console.error('Error updating timetable:', err);
        // Mongoose validation errors often have `err.errors`
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return res.status(400).json({ msg: 'Mongoose Validation Error', errors });
        }
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete Timetable for a specific school and grade
// @route   DELETE /api/admin/schools/:schoolId/grades/:grade/timetable
// @access  Private (Admin only)
exports.deleteTimetableBySchoolAndGrade = async (req, res) => {
    const { schoolId, grade } = req.params;

    // Validate schoolId and grade
    if (!mongoose.Types.ObjectId.isValid(schoolId)) {
        return res.status(400).json({ msg: 'Invalid School ID format.' });
    }
    if (isNaN(parseInt(grade)) || parseInt(grade) < 1 || parseInt(grade) > 12) {
        return res.status(400).json({ msg: 'Grade must be a number between 1 and 12.' });
    }

    try {
        const timetable = await Timetable.findOneAndDelete({ school: schoolId, grade: parseInt(grade) });

        if (!timetable) {
            return res.status(404).json({ msg: 'Timetable not found for this school and grade.' });
        }

        res.status(200).json({ success: true, msg: 'Timetable deleted successfully.' });

    } catch (err) {
        console.error('Error deleting timetable:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
};