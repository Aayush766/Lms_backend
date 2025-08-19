// controllers/feedbackParametersController.js
const FeedbackParameter = require('../models/FeedbackParameter');

// @desc    Get all feedback parameters
// @route   GET /api/admin/feedback-parameters
// @access  Private (Admin)
exports.getFeedbackParameters = async (req, res) => {
    try {
        const parameters = await FeedbackParameter.find().sort({ createdAt: 1 });
        res.json(parameters);
    } catch (err) {
        console.error('Error fetching feedback parameters:', err);
        res.status(500).json({ msg: 'Server error fetching feedback parameters.' });
    }
};

// @desc    Create a new feedback parameter
// @route   POST /api/admin/feedback-parameters
// @access  Private (Admin)
exports.createFeedbackParameter = async (req, res) => {
    try {
        const { question, isDefault } = req.body;
        
        // Basic validation
        if (!question) {
            return res.status(400).json({ msg: 'Feedback question is required.' });
        }

        const newParameter = new FeedbackParameter({ question, isDefault });
        await newParameter.save();

        res.status(201).json({ msg: 'Feedback parameter created successfully.', parameter: newParameter });
    } catch (err) {
        console.error('Error creating feedback parameter:', err);
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'A parameter with this question already exists.' });
        }
        res.status(500).json({ msg: 'Server error creating feedback parameter.' });
    }
};

// @desc    Update a feedback parameter
// @route   PUT /api/admin/feedback-parameters/:id
// @access  Private (Admin)
exports.updateFeedbackParameter = async (req, res) => {
    try {
        const { question, isDefault } = req.body;
        const updatedParameter = await FeedbackParameter.findByIdAndUpdate(
            req.params.id,
            { question, isDefault },
            { new: true, runValidators: true }
        );

        if (!updatedParameter) {
            return res.status(404).json({ msg: 'Feedback parameter not found.' });
        }

        res.json({ msg: 'Feedback parameter updated successfully.', parameter: updatedParameter });
    } catch (err) {
        console.error('Error updating feedback parameter:', err);
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'A parameter with this question already exists.' });
        }
        res.status(500).json({ msg: 'Server error updating feedback parameter.' });
    }
};

// @desc    Delete a feedback parameter
// @route   DELETE /api/admin/feedback-parameters/:id
// @access  Private (Admin)
exports.deleteFeedbackParameter = async (req, res) => {
    try {
        const parameter = await FeedbackParameter.findByIdAndDelete(req.params.id);

        if (!parameter) {
            return res.status(404).json({ msg: 'Feedback parameter not found.' });
        }

        res.json({ msg: 'Feedback parameter deleted successfully.' });
    } catch (err) {
        console.error('Error deleting feedback parameter:', err);
        res.status(500).json({ msg: 'Server error deleting feedback parameter.' });
    }
};

// @desc    Set a default feedback parameter (example of a more complex operation)
// @route   PUT /api/admin/feedback-parameters/set-default/:id
// @access  Private (Admin)
exports.setDefaultFeedbackParameter = async (req, res) => {
    try {
        const { id } = req.params;

        // First, find the current default and remove the flag
        await FeedbackParameter.findOneAndUpdate({ isDefault: true }, { isDefault: false });

        // Then, set the new default
        const newDefault = await FeedbackParameter.findByIdAndUpdate(id, { isDefault: true }, { new: true });

        if (!newDefault) {
            return res.status(404).json({ msg: 'Parameter not found to be set as default.' });
        }

        res.json({ msg: 'Default feedback parameter updated successfully.', newDefault });
    } catch (err) {
        console.error('Error setting default feedback parameter:', err);
        res.status(500).json({ msg: 'Server error setting default feedback parameter.' });
    }
};