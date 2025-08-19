const cloudinary = require('../config/cloudinary'); // Ensure this config is correct
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const User = require('../models/User');

// Configure Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'student_profile_pics',
    format: async (req, file) => 'jpeg', // Or 'png', 'jpg', 'webp'
    public_id: (req, file) => `profile-${req.user.id}-${Date.now()}`, // Unique ID for the image
  },
});

const upload = multer({ storage: storage });

// Controller function for uploading profile picture
exports.uploadProfilePicture = async (req, res) => { // --- NEW FUNCTION ---
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded.' });
    }

    const profilePictureUrl = req.file.path; // URL from Cloudinary
    const userId = req.user.id; // From auth middleware

    await User.findByIdAndUpdate(userId, { profilePicture: profilePictureUrl });

    res.json({ msg: 'Profile picture uploaded successfully', profilePictureUrl });

  } catch (err) {
    console.error('Error uploading profile picture:', err);
    res.status(500).json({ msg: 'Server error during profile picture upload.' });
  }
};

// Export the multer upload instance as middleware
exports.uploadMiddleware = upload; // --- NEW EXPORT ---


