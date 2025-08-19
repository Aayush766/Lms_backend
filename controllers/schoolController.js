// controllers/schoolController.js
const mongoose = require('mongoose');
const School = require('../models/School');
const User = require('../models/User'); // Assuming User model is needed for populating
const Timetable = require('../models/TimeTable'); // Make sure to import your Timetable model

// Add a new School
exports.addSchool = async (req, res) => {
    try {
        const {
            schoolName,
            schoolCode,
            address,
            city,
            schoolCoordinatorName,
            schoolCoordinatorContact,
            schoolPrincipalName,
            schoolPrincipalContact,
             gradesAndSections
        } = req.body;

        // Basic validation
        if (!schoolName || !schoolCode || !address || !city || !schoolCoordinatorName || !schoolCoordinatorContact || !schoolPrincipalName || !schoolPrincipalContact) {
            return res.status(400).json({ msg: 'All school fields are required.' });
        }

        // --- ADDED: Validation for the new gradesAndSections field ---
        if (!gradesAndSections || !Array.isArray(gradesAndSections) || gradesAndSections.length === 0) {
            return res.status(400).json({ msg: 'At least one grade with sections is required.' });
        }
        for (const entry of gradesAndSections) {
            if (!entry.grade || !entry.sections || !Array.isArray(entry.sections) || entry.sections.length === 0) {
                return res.status(400).json({ msg: 'Each grade must have a grade value and at least one section.' });
            }
        }

        // Check if school already exists by name or code
        let school = await School.findOne({ $or: [{ schoolName }, { schoolCode }] });
        if (school) {
            return res.status(400).json({ msg: 'School with this name or code already exists.' });
        }

        school = new School({
            schoolName,
            schoolCode,
            address,
            city,
            schoolCoordinatorName,
            schoolCoordinatorContact,
            schoolPrincipalName,
            schoolPrincipalContact,
            gradesAndSections 
        });

        await school.save();
        res.status(201).json({ msg: 'School added successfully', school });

    } catch (err) {
        console.error('Error adding school:', err);
        // Handle duplicate key errors specifically for unique fields
        if (err.code === 11000) {
            if (err.keyPattern && err.keyPattern.schoolName) {
                return res.status(400).json({ msg: 'A school with this name already exists.' });
            }
            if (err.keyPattern && err.keyPattern.schoolCode) {
                return res.status(400).json({ msg: 'A school with this code already exists.' });
            }
        }
        // Handle Mongoose validation errors
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: `Validation error: ${messages.join(', ')}` });
        }
        res.status(500).json({ msg: 'Server error adding school', error: err.message });
    }
};

// Get all schools
exports.getAllSchools = async (req, res) => {
    try {
        const schools = await School.find({});
        res.json(schools); // Send array directly as frontend expects it for dropdown
    } catch (err) {
        console.error('Error fetching all schools:', err);
        res.status(500).json({ msg: 'Server error fetching schools', error: err.message });
    }
};

// Get a single school by ID with details
exports.getSchoolDetails = async (req, res) => {
    try {
        const { id } = req.params;
        // CORRECTED: Find by schoolName instead of _id to match the URL parameter
        const school = await School.findOne({ schoolName: id }); 

        if (!school) {
            return res.status(404).json({ msg: 'School not found.' });
        }

        res.json({ school });
    } catch (err) {
        console.error('Error fetching school details:', err);
        res.status(500).json({ msg: 'Server error fetching school details', error: err.message });
    }
};


// Update a school by ID
exports.updateSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            schoolName,
            schoolCode,
            address,
            city,
            schoolCoordinatorName,
            schoolCoordinatorContact,
            schoolPrincipalName,
            schoolPrincipalContact,
           gradesAndSections 
        } = req.body;

        const school = await School.findById(id);

        if (!school) {
            return res.status(404).json({ msg: 'School not found.' });
        }

         // --- ADDED: Validation for the new gradesAndSections field ---
        if (!gradesAndSections || !Array.isArray(gradesAndSections) || gradesAndSections.length === 0) {
            return res.status(400).json({ msg: 'At least one grade with sections is required.' });
        }
        for (const entry of gradesAndSections) {
            if (!entry.grade || !entry.sections || !Array.isArray(entry.sections) || entry.sections.length === 0) {
                return res.status(400).json({ msg: 'Each grade must have a grade value and at least one section.' });
            }
        }

        // Update fields if provided
        school.schoolName = schoolName || school.schoolName;
        school.schoolCode = schoolCode || school.schoolCode;
        school.address = address || school.address;
        school.city = city || school.city;
        school.schoolCoordinatorName = schoolCoordinatorName || school.schoolCoordinatorName;
        school.schoolCoordinatorContact = schoolCoordinatorContact || school.schoolCoordinatorContact;
        school.schoolPrincipalName = schoolPrincipalName || school.schoolPrincipalName;
        school.schoolPrincipalContact = schoolPrincipalContact || school.schoolPrincipalContact;
         school.gradesAndSections = gradesAndSections;

        await school.save(); // This will trigger Mongoose validation

        res.json({ msg: 'School updated successfully', school });

    } catch (err) {
        console.error('Error updating school:', err);
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Error updating school: Duplicate school name or code.' });
        }
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: `Validation error: ${messages.join(', ')}` });
        }
        res.status(500).json({ msg: 'Server error updating school', error: err.message });
    }
};

// Delete a school by ID
exports.deleteSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedSchool = await School.findByIdAndDelete(id);

        if (!deletedSchool) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }

        res.status(200).json({ success: true, message: 'School deleted successfully' });
    } catch (error) {
        console.error('Error deleting school:', error);
        res.status(500).json({ success: false, message: 'Server error during school deletion' });
    }
};

// Get assigned trainers for a specific school
exports.getAssignedTrainersBySchool = async (req, res) => {
    try {
        const { schoolName } = req.params; // Use schoolName from params

        const trainers = await User.find({
            role: 'trainer',
            // Check if schoolName exists in either trainerSchool (single string) or assignedSchools (array)
            $or: [
                { trainerSchool: schoolName },
                { assignedSchools: schoolName }
            ]
        }).select('_id name email'); // Exclude sensitive fields, select only necessary for frontend dropdown

        res.json({ trainers });
    } catch (err) {
        console.error('Error fetching assigned trainers for school:', err);
        res.status(500).json({ msg: 'Server error fetching assigned trainers', error: err.message });
    }
};

// Get students for a specific school (grade-wise or all)
exports.getStudentsBySchool = async (req, res) => {
    try {
        const { schoolName } = req.params;
        const { grade } = req.query; // Optional: filter by grade

        let query = { role: 'student', school: schoolName };
        if (grade) {
            query.grade = parseInt(grade);
        }

        // Populate assignedTrainer to show trainer name and email
        const students = await User.find(query)
            .select('-password -resetPasswordToken -resetPasswordExpire')
            .populate('assignedTrainer', 'name email');

        res.json({ students });
    } catch (err) {
        console.error('Error fetching students for school:', err);
        res.status(500).json({ msg: 'Server error fetching students', error: err.message });
    }
};

// @desc    Get timetable for a specific school and grade
// @route   GET /api/admin/schools/:schoolId/grades/:grade/timetable
// @access  Private (Admin)
exports.getTimetableBySchoolAndGrade = async (req, res) => {
    try {
        const { schoolId, grade } = req.params;

        // CORRECTED: First, find the school by its name (assuming schoolId parameter is actually the name)
        const school = await School.findOne({ schoolName: schoolId });
        if (!school) {
            return res.status(404).json({ msg: 'School not found.' });
        }
        
        const timetable = await Timetable.findOne({ school: school._id, grade: parseInt(grade) })
            .populate('school', 'schoolName') // Populate school name
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
        const { schedule } = req.body; // schedule should be an array of timetableEntrySchema objects

        // CORRECTED: Find the school by its name first
        const school = await School.findOne({ schoolName: schoolId });
        if (!school) {
            return res.status(404).json({ msg: 'School not found.' });
        }
        
        if (!Array.isArray(schedule)) {
            return res.status(400).json({ msg: 'Schedule must be an array.' });
        }

        // Validate each entry in the schedule
        for (const entry of schedule) {
            // If the entry is marked as holiday, subject and trainer are not required
            if (!entry.isHoliday) {
                if (!entry.day || !entry.time || !entry.subject || !entry.trainer) {
                    return res.status(400).json({ msg: 'Each schedule entry must contain day, time, subject, and trainer (unless marked as holiday).' });
                }
                 // Optional: Validate if trainer ID actually exists and is a trainer
                if (!mongoose.Types.ObjectId.isValid(entry.trainer)) {
                    return res.status(400).json({ msg: `Invalid Trainer ID format for entry: ${entry.trainer}` });
                }
                const trainerUser = await User.findById(entry.trainer);
                if (!trainerUser || trainerUser.role !== 'trainer') {
                    return res.status(400).json({ msg: `Trainer with ID ${entry.trainer} not found or is not a trainer.` });
                }
            } else {
                // If it's a holiday, clear subject and trainer as they are not relevant
                entry.subject = '';
                entry.trainer = null; // Set to null for DB consistency
            }
            
            // You can add validation for isHoliday if needed (e.g., must be boolean)
            if (entry.isHoliday !== undefined && typeof entry.isHoliday !== 'boolean') {
                return res.status(400).json({ msg: 'isHoliday must be a boolean value.' });
            }
        }

        const timetable = await Timetable.findOneAndUpdate(
            // CORRECTED: Use the found school's _id to query the timetable
            { school: school._id, grade: parseInt(grade) }, 
            { schedule: schedule },
            { new: true, upsert: true, runValidators: true } // upsert: create if not found, runValidators: apply schema validators
        )
        .populate('school', 'schoolName')
        .populate({
            path: 'schedule.trainer',
            select: 'name'
        });

        res.json({ success: true, msg: 'Timetable updated successfully', timetable });
    } catch (err) {
        console.error('Error updating timetable:', err.message);
        // Mongoose validation errors often have `err.errors`
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return res.status(400).json({ msg: 'Validation Error', errors });
        }
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete timetable for a specific school and grade
// @route   DELETE /api/admin/schools/:schoolId/grades/:grade/timetable
// @access  Private (Admin)
exports.deleteTimetable = async (req, res) => {
    try {
        const { schoolId, grade } = req.params;
        
        // CORRECTED: Find the school by its name first
        const school = await School.findOne({ schoolName: schoolId });
        if (!school) {
            return res.status(404).json({ msg: 'School not found.' });
        }

        const result = await Timetable.findOneAndDelete({ school: school._id, grade: parseInt(grade) });

        if (!result) {
            return res.status(404).json({ success: false, msg: 'Timetable not found for this school and grade.' });
        }

        res.json({ success: true, msg: 'Timetable deleted successfully.' });
    } catch (err) {
        console.error('Error deleting timetable:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};