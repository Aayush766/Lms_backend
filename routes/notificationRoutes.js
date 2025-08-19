// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification'); // Your Notification model
const { auth } = require('../middleware/authMiddleware'); // Corrected import to use 'auth' directly

// @route   GET /api/notifications
// @desc    Get all notifications for the authenticated user
// @access  Private
router.get('/', auth, async (req, res) => { // <-- Changed from authMiddleware to auth
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const notifications = await Notification.find({
      userId: userId,
      onModel: userRole
    }).sort({ createdAt: -1 });

    res.json({ success: true, notifications });
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark a specific notification as read
// @access  Private
router.put('/:id/read', auth, async (req, res) => { // <-- Changed from authMiddleware to auth
  try {
    const notificationId = req.params.id;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found or not authorized' });
    }

    res.json({ success: true, msg: 'Notification marked as read', notification });
  } catch (err) {
    console.error('Error marking notification as read:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   DELETE /api/notifications/clear-all
// @desc    Clear all notifications for the authenticated user
// @access  Private
router.delete('/clear-all', auth, async (req, res) => { // <-- Changed from authMiddleware to auth
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const result = await Notification.deleteMany({
      userId: userId,
      onModel: userRole
    });

    res.json({ success: true, msg: `${result.deletedCount} notifications cleared.` });
  } catch (err) {
    console.error('Error clearing notifications:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;