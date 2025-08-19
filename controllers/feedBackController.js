// controllers/feedBackController.js

const User = require('../models/User'); // Import the User model
const FeedbackParameter = require('../models/FeedbackParameter');


exports.submitStudentFeedback = async (req, res) => {
    try {
        const studentId = req.user.id;
        const studentRole = req.user.role;

        if (!studentId || studentRole !== 'student') {
            return res.status(403).json({ msg: 'Access denied. Only students can submit feedback.' });
        }

        // Fetch student details from DB to get their name, school, grade for the feedback entry
        const student = await User.findById(studentId).select('name school grade');

        if (!student) {
            return res.status(404).json({ msg: 'Logged-in student not found in database.' });
        }

        const { trainerId, feedback, ratings } = req.body;

        // Verify the trainer exists and is actually a trainer
        // We only need to check role here, as we're not modifying the trainer's core fields
        const trainerExists = await User.exists({ _id: trainerId, role: 'trainer' });
        if (!trainerExists) {
            return res.status(400).json({ msg: 'Invalid trainer selected or trainer not found.' });
        }

         // --- NEW VALIDATION: Check if ratings match the current parameters ---
        const currentParameters = await FeedbackParameter.find().select('question');
        const requiredQuestions = currentParameters.map(p => p.question);
        const submittedQuestions = Object.keys(ratings);

        const allRatingsSubmitted = requiredQuestions.every(q => submittedQuestions.includes(q));
        if (!allRatingsSubmitted) {
            return res.status(400).json({ msg: 'Please provide ratings for all required feedback parameters.' });
        }
        // --- END NEW VALIDATION ---

        // Construct feedback entry
        const feedbackEntry = {
            submittedBy: studentId,
            submittedByName: student.name,
            submittedBySchool: student.school,
            submittedByGrade: student.grade,
            ratings: ratings,
            feedback: feedback,
            submittedAt: new Date()
        };

        // --- FIX STARTS HERE ---
        // Use findByIdAndUpdate with $push to add feedback without re-validating the entire trainer document
        const updatedTrainer = await User.findByIdAndUpdate(
            trainerId,
            { $push: { studentFeedback: feedbackEntry } },
            { new: true, runValidators: false } // 'new: true' returns the updated document, 'runValidators: false' is CRUCIAL here
        );

        if (!updatedTrainer) {
            return res.status(404).json({ msg: 'Trainer not found when trying to update feedback.' });
        }
        // --- FIX ENDS HERE ---

        res.status(200).json({ msg: 'Feedback submitted successfully!' });

    } catch (err) {
        console.error('Error submitting feedback:', err);
        if (err.name === 'ValidationError') {
            // If any validation errors occur despite runValidators: false (e.g. on the $push operation itself)
            const errors = Object.values(err.errors).map(el => el.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
        res.status(500).json({ msg: 'Server error during feedback submission.' });
    }
};

// ... (your existing getTrainerStudentFeedback function) ...

// @desc    Get all student feedback for a specific trainer (for admin)
// @route   GET /api/admin/trainers/:trainerId/student-feedback
// @access  Private (Admin)
exports.getTrainerStudentFeedback = async (req, res) => {
    const { trainerId } = req.params;

    try {
        const trainer = await User.findById(trainerId).select('name email studentFeedback role');

        if (!trainer) {
            console.log('Trainer not found by ID');
            return res.status(404).json({ msg: 'Trainer not found by ID' });
        }

        console.log('Trainer found:', trainer.name);
        console.log('Trainer role:', trainer.role);

        if (trainer.role.toLowerCase() !== 'trainer') {
            console.log('User exists but role is not trainer');
            return res.status(404).json({ msg: 'User is not a trainer.' });
        }

        res.json({
            trainerName: trainer.name,
            trainerEmail: trainer.email,
            feedback: trainer.studentFeedback || []
        });

    } catch (err) {
        console.error('Error fetching student feedback for trainer:', err.message);
        res.status(500).json({ msg: 'Server error while fetching trainer feedback.' });
    }
};