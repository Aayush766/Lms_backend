// controllers/classDetailsController.js
const ClassDetails = require('../models/ClassDetails');
const User = require('../models/User');
// Removed `const School = require('../models/School');` as the `school` field
// in ClassDetails model is stored as a String (school name), not an ObjectId reference.
const { format, parseISO, subHours } = require('date-fns');

const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const classFilesStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'class_details_attachments',
        format: async (req, file) => {
            const allowedImageFormats = ['jpeg', 'png', 'jpg', 'gif', 'webp'];
            const allowedVideoFormats = ['mp4', 'mov', 'avi', 'mkv'];
            const ext = file.originalname.split('.').pop().toLowerCase();

            if (allowedImageFormats.includes(ext)) {
                return 'jpeg';
            } else if (allowedVideoFormats.includes(ext)) {
                return 'mp4';
            }
            return 'raw';
        },
        public_id: (req, file) => {
            const originalFileName = file.originalname.split('.')[0];
            return `class-${req.user.id}-${Date.now()}-${originalFileName}`;
        },
        resource_type: (req, file) => {
            const videoMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
            return videoMimeTypes.includes(file.mimetype) ? 'video' : 'image';
        },
    },
});

const upload = multer({ storage: classFilesStorage });

exports.uploadClassAttachments = upload.array('attachedFiles', 10);

exports.addClassDetails = async (req, res) => {
    const uploadedFiles = req.files || [];
    const attachedFilesUrls = uploadedFiles.map(file => file.path);

    // ADD SECTION TO DESTRUCTURING
    const { grade, sessionNumber, sessionTitle, studentsCount, learningOutcome, remarks, date, school, section, weekNumber } = req.body;

    const trainer = req.user.id;

    // ADD SECTION TO VALIDATION
    if (!grade || !sessionNumber || !sessionTitle || studentsCount === undefined || !learningOutcome || !date || !school || !section || !weekNumber) {
        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                const publicId = file.filename.split('/').pop().split('.')[0];
                console.log(`Deleting Cloudinary file: ${publicId}`);
                await cloudinary.uploader.destroy(publicId, { resource_type: file.resource_type });
            }
        }
        return res.status(400).json({ msg: 'Please enter all required fields including grade, session, students count, learning outcome, date, school, and section.' });
    }

    try {
        const newClassDetails = new ClassDetails({
            trainer,
            grade: parseInt(grade, 10),
            sessionNumber: parseInt(sessionNumber, 10),
            sessionTitle,
            studentsCount: parseInt(studentsCount, 10),
            learningOutcome,
            remarks,
            date: new Date(date),
            attachedFiles: attachedFilesUrls,
            school,
            section, // ADD SECTION TO NEW CLASS DETAILS OBJECT
             weekNumber,
        });

        const classDetail = await newClassDetails.save();
        res.status(201).json({ msg: 'Class details added successfully!', classDetail });
    } catch (err) {
        console.error('Error saving class details:', err.message);
        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                const publicId = file.filename.split('/').pop().split('.')[0];
                console.error(`Attempting to delete orphaned Cloudinary file: ${publicId}`);
                await cloudinary.uploader.destroy(publicId, { resource_type: file.resource_type }).catch(deleteErr => {
                    console.error(`Failed to delete Cloudinary file ${publicId}:`, deleteErr);
                });
            }
        }
        res.status(500).json({ msg: 'Server error. Failed to save class details.' });
    }
};

// @desc    Get all class details (Admin only)
// @route   GET /api/v1/class-details
// @access  Private (Admin)
exports.getAllClassDetails = async (req, res) => {
    try {
        const { school, grade, trainer, date, month, year, section } = req.query;
        let query = {};

        if (trainer) {
            query.trainer = trainer;
        }
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setUTCHours(23, 59, 59, 999);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        } else if (month && year) {
            const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
            const endOfMonth = new Date(parseInt(year), parseInt(month), 0);
            query.date = { $gte: startOfMonth, $lte: endOfMonth };
        } else if (month) {
            const currentYear = new Date().getFullYear();
            const startOfMonth = new Date(currentYear, parseInt(month) - 1, 1);
            const endOfMonth = new Date(currentYear, parseInt(month), 0);
            query.date = { $gte: startOfMonth, $lte: endOfMonth };
        } else if (year) {
            const startOfYear = new Date(parseInt(year), 0, 1);
            const endOfYear = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
            query.date = { $gte: startOfYear, $lte: endOfYear };
        }

        // Corrected: ClassDetails model stores school as a String (school name), not an ObjectId.
        // So, we directly use the 'school' query parameter.
        if (school) {
            query.school = school;
        }

        if (grade) {
            query.grade = parseInt(grade, 10);
        }

        if (section) {
            query.section = req.query.section;
        }

        const classDetails = await ClassDetails.find(query)
            .populate('trainer', 'name')
            .sort({ date: 1 }); // Sort by date for chronological display
        res.json(classDetails);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};


// @desc    Get class details for the logged-in trainer
// @route   GET /api/v1/class-details/my
// @access  Private (Trainer)
exports.getMyClassDetails = async (req, res) => {
    try {
        const trainerId = req.user.id;
        const { date, month, year, school, grade } = req.query; // Existing query parameters
        let query = { trainer: trainerId };

        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setUTCHours(23, 59, 59, 999);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        } else if (month && year) {
            const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
            const endOfMonth = new Date(parseInt(year), parseInt(month), 0);
            query.date = { $gte: startOfMonth, $lte: endOfMonth };
        } else if (month) {
            const currentYear = new Date().getFullYear();
            const startOfMonth = new Date(currentYear, parseInt(month) - 1, 1);
            const endOfMonth = new Date(currentYear, parseInt(month), 0);
            query.date = { $gte: startOfMonth, $lte: endOfMonth };
        } else if (year) {
            const startOfYear = new Date(parseInt(year), 0, 1);
            const endOfYear = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
            query.date = { $gte: startOfYear, $lte: endOfYear };
        }

        // Corrected: ClassDetails model stores school as a String (school name), not an ObjectId.
        // So, we directly use the 'school' query parameter.
        if (school) {
            query.school = school;
        }

        if (grade) {
            query.grade = parseInt(grade, 10);
        }

        // Add section filter (optional)
        if (req.query.section) {
            query.section = req.query.section;
        }

        const classDetails = await ClassDetails.find(query)
            .populate('trainer', 'name email')
            .sort({ date: -1, grade: 1, sessionNumber: 1 });

        res.json(classDetails);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};



// This function is duplicated in the original file, assuming it's meant to be the same as the first getAllClassDetails
// I am modifying it again here for completeness, though typically you'd only have one.
exports.getAllClassDetails = async (req, res) => {
    try {
        const { school, grade, trainer, date, month, year, section } = req.query;
        let query = {};

        if (trainer) {
            query.trainer = trainer;
        }
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setUTCHours(23, 59, 59, 999);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        } else if (month && year) {
            const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
            const endOfMonth = new Date(parseInt(year), parseInt(month), 0);
            query.date = { $gte: startOfMonth, $lte: endOfMonth };
        } else if (month) {
            const currentYear = new Date().getFullYear();
            const startOfMonth = new Date(currentYear, parseInt(month) - 1, 1);
            const endOfMonth = new Date(currentYear, parseInt(month), 0);
            query.date = { $gte: startOfMonth,                       $lte: endOfMonth };
        } else if (year) {
            const startOfYear = new Date(parseInt(year), 0, 1);
            const endOfYear = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
            query.date = { $gte: startOfYear, $lte: endOfYear };
        }

        // Corrected: ClassDetails model stores school as a String (school name), not an ObjectId.
        // So, we directly use the 'school' query parameter.
        if (school) {
            query.school = school;
        }

        if (grade) {
            query.grade = parseInt(grade, 10);
        }

        if (section) {
            query.section = req.query.section;
        }

        const classDetails = await ClassDetails.find(query)
            .populate('trainer', 'name')
            .sort({ date: 1 }); // Sort by date for chronological display
        res.json(classDetails);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.updateClassDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { grade, sessionNumber, sessionTitle, studentsCount, learningOutcome, remarks, date, school, section, weekNumber } = req.body;

        const classDetail = await ClassDetails.findById(id);

        if (!classDetail) {
            return res.status(404).json({ msg: 'Class detail report not found.' });
        }

        // Check if the logged-in trainer is the creator of the report
        if (classDetail.trainer.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'You are not authorized to update this report.' });
        }

        // Check if the report is within the 24-hour edit window
        const now = new Date();
        const reportCreationTime = new Date(classDetail.createdAt);
        const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

        if (now - reportCreationTime > twentyFourHoursInMs) {
            return res.status(403).json({ msg: 'The 24-hour window to edit this report has expired.' });
        }

        // Update the fields
        classDetail.grade = parseInt(grade, 10);
        classDetail.sessionNumber = parseInt(sessionNumber, 10);
        classDetail.sessionTitle = sessionTitle;
        classDetail.studentsCount = parseInt(studentsCount, 10);
        classDetail.learningOutcome = learningOutcome;
        classDetail.remarks = remarks;
        classDetail.date = new Date(date);
        classDetail.school = school;
        classDetail.section = section;
        classDetail.weekNumber = weekNumber;

        await classDetail.save();

        res.status(200).json({ msg: 'Class details updated successfully!', classDetail });

    } catch (err) {
        console.error('Error updating class details:', err.message);
        res.status(500).json({ msg: 'Server error. Failed to update class details.' });
    }
};

exports.getLast24HrsClassDetails = async (req, res) => {
    try {
        const twentyFourHoursAgo = subHours(new Date(), 24);
        const submittedData = await ClassDetails.find({
            createdAt: { $gte: twentyFourHoursAgo }
        })
        .populate('trainer', 'name')
        .sort({ createdAt: -1 });

        res.json(submittedData);
    } catch (err) {
        console.error('Error fetching last 24 hours submissions:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};
