const AssignedSession = require('../models/AssignedSession');
const User = require('../models/User'); // To find trainers and schools
const School = require('../models/School'); // To validate school existence

// @desc    Assign sessions for a specific school, grade, section, and month
// @route   POST /api/assigned-sessions
// @access  Private/Admin
exports.assignSessions = async (req, res) => {
    const { school, grade, month, section, sessions } = req.body;
    const createdBy = req.user.id; // Admin's ID from auth middleware

    if (!school || !grade || !month || !section || !sessions || !Array.isArray(sessions) || sessions.length === 0) {
        return res.status(400).json({ msg: 'Please provide school, grade, month, section, and at least one session.' });
    }

    // Removed 'Both' from this validation as it's handled by frontend now,
    // and backend will always receive 'Boys' or 'Girls' when creating new.
    // However, the 'Both' case for new assignments is explicitly handled below.
    if (!['Boys', 'Girls', 'Both'].includes(section)) {
        return res.status(400).json({ msg: 'Invalid section. Must be "Boys", "Girls", or "Both".' });
    }

    try {
        // Validate school
        const existingSchool = await School.findById(school);
        if (!existingSchool) {
            return res.status(404).json({ msg: 'School not found.' });
        }

        const baseSessionData = {
            school,
            grade,
            month,
            sessions: sessions.map(session => ({
                sessionNumber: session.sessionNumber,
                sessionTitle: session.sessionTitle || `Session ${session.sessionNumber}`, // Default title
                isCompleted: false, // Default to false on creation
                trainer: null, // Ensure trainer is null on initial assignment
                completedBy: null,
                completionDate: null
            })),
            createdBy,
        };

        if (section === 'Both') {
            // Check for existing Boys AND Girls assignments for this combination
            const existingBoysAssignment = await AssignedSession.findOne({ school, grade, section: 'Boys', month });
            const existingGirlsAssignment = await AssignedSession.findOne({ school, grade, section: 'Girls', month });

            if (existingBoysAssignment && existingGirlsAssignment) {
                // If both exist, we cannot assign 'Both' again. Suggest update.
                return res.status(400).json({ msg: 'Assignments for both Boys and Girls sections for this school, grade, and month already exist. Please update them individually.' });
            } else if (existingBoysAssignment) {
                // If only Boys exists, ask them to assign for Girls separately
                return res.status(400).json({ msg: 'An assignment for the Boys section already exists. Please assign for Girls section separately, or update the Boys assignment.' });
            } else if (existingGirlsAssignment) {
                // If only Girls exists, ask them to assign for Boys separately
                return res.status(400).json({ msg: 'An assignment for the Girls section already exists. Please assign for Boys section separately, or update the Girls assignment.' });
            }

            // If neither exists, create both
            const newBoysAssignment = new AssignedSession({ ...baseSessionData, section: 'Boys' });
            const newGirlsAssignment = new AssignedSession({ ...baseSessionData, section: 'Girls' });

            await newBoysAssignment.save();
            await newGirlsAssignment.save();

            res.status(201).json({ msg: 'Sessions assigned for Both Boys and Girls successfully!', assignedSessions: [newBoysAssignment, newGirlsAssignment] });

        } else {
            // Handle 'Boys' or 'Girls' section directly (single assignment)
            let assignedSession = await AssignedSession.findOne({ school, grade, section, month });

            if (assignedSession) {
                // If an assignment for this specific section exists, prevent creating a new one.
                // The frontend should handle this via edit mode.
                return res.status(400).json({ msg: `An assignment for this school, grade, and ${section} section for this month already exists. Please update it instead.` });
            } else {
                // Create new assigned session
                assignedSession = new AssignedSession({
                    ...baseSessionData,
                    section
                });
                await assignedSession.save();
                res.status(201).json({ msg: 'Sessions assigned successfully!', assignedSession });
            }
        }

    } catch (err) {
        console.error(err.message);
        if (err.code === 11000) { // Duplicate key error for unique index
            return res.status(400).json({ msg: 'An assignment for this school, grade, section, and month already exists. Please update it instead.' });
        }
        res.status(500).send('Server Error');
    }
};

// @desc    Get assigned sessions (with filters)
// @route   GET /api/assigned-sessions
// @access  Private/Admin
exports.getAssignedSessions = async (req, res) => {
    try {
        const { school, grade, month, year, section } = req.query;
        let query = {};

        if (school) {
            query.school = school;
        }
        // Ensure month and year are handled as YYYY-MM if that's how you store it,
        // or as separate number fields in your AssignedSession model.
        // The frontend is sending month as a number and year as a number.
        if (month && year) {
            // If your model stores month as YYYY-MM string:
            // query.month = `${year}-${String(month).padStart(2, '0')}`;
            // If your model stores month/year as separate numbers:
            query.month = `${year}-${String(month).padStart(2, '0')}`; // Still use YYYY-MM for the query if your model is like AssignedSession.js
        } else if (month) {
             const currentYear = new Date().getFullYear();
             query.month = `${currentYear}-${String(month).padStart(2, '0')}`;
        } else if (year) {
             // For year only, you'd need to match all months in that year
             query.month = { $regex: `^${year}-` };
        }

        if (grade) {
            query.grade = parseInt(grade, 10);
        }
        if (section) {
            query.section = section;
        }

        const assignedSessions = await AssignedSession.find(query)
            .populate('school', 'schoolName')
            .populate('sessions.trainer', 'name'); // Populate trainer name if needed
        res.json(assignedSessions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Update an assigned session (e.g., mark a session complete, or reassign trainer)
// @route   PUT /api/assigned-sessions/:id
// @access  Private/Admin
exports.updateAssignedSession = async (req, res) => {
    const { id } = req.params;
    const { sessions, school, grade, month, section } = req.body;

    try {
        const assignedSession = await AssignedSession.findById(id);

        if (!assignedSession) {
            return res.status(404).json({ msg: 'Assigned session not found.' });
        }

        // Basic validation for trainers if they are being updated
        if (sessions && Array.isArray(sessions)) {
            const trainerIds = sessions.filter(s => s.trainer).map(s => s.trainer);
            if (trainerIds.length > 0) {
                const existingTrainers = await User.find({ _id: { $in: trainerIds }, role: 'trainer' });
                if (existingTrainers.length !== trainerIds.length) {
                    return res.status(400).json({ msg: 'One or more trainers provided for sessions not found or are not trainers.' });
                }
            }
        }

        // Update top-level fields if provided and allowed
        // Only allow updating if it doesn't conflict with unique index
        const potentialUpdate = {};
        let changedFields = false;

        if (school && String(assignedSession.school) !== school) {
            potentialUpdate.school = school;
            changedFields = true;
        }
        if (grade && assignedSession.grade !== grade) {
            potentialUpdate.grade = grade;
            changedFields = true;
        }
        if (month && assignedSession.month !== month) {
            potentialUpdate.month = month;
            changedFields = true;
        }
        if (section && ['Boys', 'Girls'].includes(section) && assignedSession.section !== section) {
            potentialUpdate.section = section;
            changedFields = true;
        }

        // Check for duplicate if primary keys are being changed
        if (changedFields) {
            const existingDuplicate = await AssignedSession.findOne({
                school: potentialUpdate.school || assignedSession.school,
                grade: potentialUpdate.grade || assignedSession.grade,
                section: potentialUpdate.section || assignedSession.section,
                month: potentialUpdate.month || assignedSession.month,
                _id: { $ne: id } // Exclude the current document from the search
            });

            if (existingDuplicate) {
                return res.status(400).json({ msg: 'Updating these fields would create a duplicate assignment. Please choose unique combination or update the existing duplicate.' });
            }
        }

        // Apply top-level updates
        Object.assign(assignedSession, potentialUpdate);

        // CRITICAL FIX/UPDATE: Replace the entire sessions array if provided.
        // This is where you decide how to handle session updates.
        // If the frontend sends the *full* new array of sessions (e.g., from changing total sessions),
        // we replace. If you wanted to merge or update individual sessions, the frontend
        // would need to send granular updates, and this logic would be different.
        if (sessions && Array.isArray(sessions)) {
            // This logic will replace the sessions array entirely with the new one.
            // If you need to preserve existing trainers/completion status for sessions
            // that remain the same (e.g., if total sessions didn't change but one trainer did),
            // you'd need to iterate and merge based on sessionNumber.
            // For now, assuming frontend sends a complete, updated `sessions` array on edit.
            assignedSession.sessions = sessions.map(newSession => {
                // Try to find the corresponding existing session to preserve its state
                const existingSession = assignedSession.sessions.find(s => s.sessionNumber === newSession.sessionNumber);

                return {
                    sessionNumber: newSession.sessionNumber,
                    sessionTitle: newSession.sessionTitle || `Session ${newSession.sessionNumber}`,
                    // Preserve trainer, isCompleted, completedBy, completionDate if not explicitly overridden by newSession
                    trainer: newSession.trainer !== undefined ? newSession.trainer : (existingSession ? existingSession.trainer : null),
                    isCompleted: typeof newSession.isCompleted === 'boolean' ? newSession.isCompleted : (existingSession ? existingSession.isCompleted : false),
                    completedBy: newSession.completedBy !== undefined ? newSession.completedBy : (existingSession ? existingSession.completedBy : null),
                    completionDate: newSession.completionDate !== undefined ? newSession.completionDate : (existingSession ? existingSession.completionDate : null)
                };
            });
        }

        assignedSession.updatedAt = Date.now();
        await assignedSession.save();

        res.json({ msg: 'Assigned session updated successfully!', assignedSession });
    } catch (err) {
        console.error(err.message);
        if (err.code === 11000) { // Duplicate key error after update for unique index
            return res.status(400).json({ msg: 'An assignment for this school, grade, section, and month already exists with the updated parameters.' });
        }
        res.status(500).send('Server Error');
    }
};

// @desc    Delete an assigned session
// @route   DELETE /api/assigned-sessions/:id
// @access  Private/Admin
exports.deleteAssignedSession = async (req, res) => {
    const { id } = req.params;

    try {
        const assignedSession = await AssignedSession.findByIdAndDelete(id);

        if (!assignedSession) {
            return res.status(404).json({ msg: 'Assigned session not found.' });
        }

        res.json({ msg: 'Assigned session removed successfully!' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get all trainers (for dropdown in frontend)
// @route   GET /api/assigned-sessions/trainers
// @access  Private/Admin (or general access if trainers list is public)
exports.getAllTrainers = async (req, res) => {
    try {
        const trainers = await User.find({ role: 'trainer' }).select('-password -__v'); // Exclude password and __v
        res.json(trainers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get all schools (for dropdown in frontend)
// @route   GET /api/assigned-sessions/schools
// @access  Private/Admin (or general access if schools list is public)
exports.getAllSchools = async (req, res) => {
    try {
        const schools = await School.find({}).select('-__v'); // Select specific fields if needed
        res.json(schools);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};