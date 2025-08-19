// controllers/sessionController.js
const Session = require('../models/Session'); // Ensure this path is correct

// Add Session for a Grade
exports.addSession = async (req, res) => {
    try {
        const { grade, name, topicName } = req.body;

        if (typeof grade !== 'number' || grade <= 0) {
            return res.status(400).json({ msg: 'Grade must be a positive number' });
        }
        if (!name || !topicName) {
            return res.status(400).json({ msg: 'Session name and topic name are required.' });
        }

        let gradeRecord = await Session.findOne({ grade });

        let newSessionNumber;
        if (!gradeRecord) {
            // First time adding sessions for this grade
            newSessionNumber = 1;
            gradeRecord = new Session({ grade, sessions: [] });
        } else {
            // Grade record exists, determine the next session number
            if (gradeRecord.sessions.length === 0) {
                // If there are no sessions yet for this grade (e.g., just created the grade record)
                newSessionNumber = 1;
            } else {
                // Find the maximum existing sessionNumber and increment it
                newSessionNumber = Math.max(...gradeRecord.sessions.map(s => s.sessionNumber)) + 1;
            }
        }

        gradeRecord.sessions.push({
            sessionNumber: newSessionNumber,
            name,
            topicName,
            // progress: 0 // You had progress here, but it's not in your sessionSchema. If you want it, add it to the schema.
        });

        await gradeRecord.save();
        res.json({ msg: `Session ${newSessionNumber} added successfully for grade ${grade}`, sessions: gradeRecord.sessions });

    } catch (err) {
        if (err.code === 11000 && err.keyPattern && err.keyPattern.grade) {
            // This error typically means you tried to create a new Session document for a grade that already has a document.
            // However, our logic now handles finding and updating existing documents, so this specific 11000 error
            // should theoretically be less common for the `grade` field itself, unless there's a race condition.
            // Keep it for general safety, but the flow is designed to prevent it for the `grade` field.
            return res.status(400).json({ msg: `Error: A session record for grade ${req.body.grade} already exists. You are trying to add a new session to it.` });
        }
        console.error('Error adding session:', err);
        res.status(500).json({ msg: 'Server error adding session', error: err.message });
    }
};

// NEW: Get Sessions by Grade (for students)
exports.getSessionsByGrade = async (req, res) => {
    try {
        const { grade } = req.query;

        if (isNaN(parseInt(grade)) || parseInt(grade) <= 0) {
            return res.status(400).json({ msg: 'Grade query parameter is required and must be a positive number.' });
        }

        const record = await Session.findOne({ grade: parseInt(grade) });

        if (!record) {
            return res.status(200).json({ sessions: [] });
        }

        res.json({ sessions: record.sessions });
    } catch (err) {
        console.error('Error fetching sessions by grade:', err);
        res.status(500).json({ msg: 'Server error fetching sessions', error: err.message });
    }
};

