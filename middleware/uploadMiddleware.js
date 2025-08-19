// middleware/upload.js
const multer = require('multer');
const { storage } = require('../config/cloudinary'); // Adjust path as needed

const upload = multer({ storage: storage });

module.exports = upload;