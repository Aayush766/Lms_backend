// controllers/materialController.js
const Content = require('../models/Content');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

// Helper function to extract public ID from Cloudinary URL
const getCloudinaryPublicId = (fileUrl) => {
    if (!fileUrl) return null;
    const parts = fileUrl.split('/');
    const uploadIndex = parts.indexOf('upload');

    if (uploadIndex === -1 || parts.length <= uploadIndex + 1) {
        return null; // 'upload' not found or URL too short
    }

    // Find the part that comes after the version number (e.g., 'v1716752000')
    let publicIdPath = parts.slice(uploadIndex + 2).join('/');

    // If there's a format transformation (e.g., /f_pdf/), remove it for the pure public ID
    // This is especially relevant for document conversions to PDF or images.
    const formatTransformMatch = publicIdPath.match(/f_([a-zA-Z0-9]+)\//);
    if (formatTransformMatch) {
        publicIdPath = publicIdPath.substring(publicIdPath.indexOf(formatTransformMatch[0]) + formatTransformMatch[0].length);
    }

    return publicIdPath.split('.')[0]; // Remove extension to get just the public ID
};

// Helper function to determine Cloudinary resource type from URL for signing
const getCloudinaryResourceType = (fileUrl) => {
    if (fileUrl.includes('/video/upload/')) {
        return 'video';
    }
    // Cloudinary serves converted documents (like PPT/DOCX to PDF) as 'image' resources.
    if (fileUrl.includes('/image/upload/') && fileUrl.endsWith('.pdf')) {
        return 'image';
    }
    // Default for raw files (like original documents stored as raw if not converted to PDF)
    // or any other type not explicitly handled.
    return 'raw';
};


// Upload Single Content
exports.uploadContent = async (req, res) => {
    try {
        const { title, type, grade, session } = req.body; // Removed videoList from destructuring here, as it's for external videos

        let fileUrl = null;
        let uploadedVideoList = []; // Keep this if you still want to allow external video links sometimes

        // Validate required fields (title, type, grade, session)
        if (!title || !type || !grade || !session) {
            if (req.file && fs.existsSync(req.file.path)) { // Clean up if validation fails early
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ msg: 'Title, type, grade, and session are required.' });
        }

        // Handle 'video' type with direct file upload
        if (type === 'video') {
            if (!req.file) {
                return res.status(400).json({ msg: 'No video file uploaded.' });
            }

            // Generate a unique public ID for Cloudinary
            const cleanedFilename = req.file.originalname.split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '');
            const publicIdPrefix = `course_content/videos/${cleanedFilename}_${Date.now()}`; // Specific folder for videos

            const uploadOptions = {
                resource_type: 'video', // CRITICAL: Set resource_type to 'video' for video uploads
                folder: 'course_content/videos',
                public_id: publicIdPrefix,
                // You can add transformations here if needed, e.g., quality, format conversion
                // For example, eager: [{ streaming_profile: 'full_hd', format: 'mp4' }]
            };

            const result = await cloudinary.uploader.upload(req.file.path, uploadOptions);
            fs.unlinkSync(req.file.path); // Delete local file after upload

            if (!result || !result.secure_url) {
                console.error('Cloudinary video upload failed or returned no secure_url:', result);
                return res.status(500).json({ msg: 'Failed to upload video to Cloudinary.' });
            }

            fileUrl = result.secure_url;
            console.log('Uploaded video to Cloudinary. Result URL:', fileUrl);

        } else { // Handle 'ebook' and 'quiz' types (documents)
            if (!req.file) {
                return res.status(400).json({ msg: `No file uploaded for content type: ${type}.` });
            }

            // File extension validation is now largely handled by Multer's fileFilter,
            // but a final check here is good practice.
            // (Removed the detailed allowedFileExtensions map from here, assuming Multer handles it well)
            // If you still need a specific check here, you can re-add it.

            // Generate a unique public ID for Cloudinary
            const cleanedFilename = req.file.originalname.split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '');
            const publicIdPrefix = `course_content/documents/${cleanedFilename}_${Date.now()}`; // Specific folder for documents

            // Upload to Cloudinary, converting to PDF on the fly
            const uploadOptions = {
                resource_type: 'raw', // Upload original as raw, then convert
                folder: 'course_content/documents', // Folder on Cloudinary
                public_id: publicIdPrefix,
                format: 'pdf', // CRITICAL: Tell Cloudinary to convert it to PDF
            };

            const result = await cloudinary.uploader.upload(req.file.path, uploadOptions);
            fs.unlinkSync(req.file.path); // Delete local file after upload

            if (!result || !result.secure_url) {
                console.error('Cloudinary document upload failed or returned no secure_url:', result);
                return res.status(500).json({ msg: 'Failed to upload file to Cloudinary.' });
            }

            fileUrl = result.secure_url; // This URL is now directly to the PDF version
            console.log('Uploaded document to Cloudinary. Result URL (PDF):', fileUrl);
        }

        const content = new Content({
            title,
            type,
            fileUrl, // fileUrl will now hold the Cloudinary URL for both videos and documents
            videoList: uploadedVideoList, // This will be empty if direct video upload is used, or can be filled for external videos
            grade: Number(grade),
            session: Number(session),
            uploadedBy: req.user.id
        });

        await content.save();
        res.status(201).json({ msg: 'Content uploaded successfully', content });

    } catch (err) {
        console.error('Error uploading content:', err);
        // Ensure cleanup of local temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        // Handle Multer errors specifically (e.g., file size limit exceeded)
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ msg: `File size too large. Maximum allowed size is 500MB.`, error: err.message });
        }
        // Handle other errors
        res.status(500).json({ msg: 'Error uploading content', error: err.message });
    }
};

// NEW: Upload Multiple Content (specifically for presentations/documents)
// This function remains largely the same, as it's specifically for documents.
exports.uploadMultipleContent = async (req, res) => {
    try {
        const { grade, session, type } = req.body;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ msg: 'No files uploaded.' });
        }
        if (!grade || !session || !type) {
            return res.status(400).json({ msg: 'Grade, session, and type are required for multiple file uploads.' });
        }
        // Ensure frontend sends 'presentation_multiple' or maps to 'ebook' or 'quiz'
        if (type !== 'ebook' && type !== 'quiz' && type !== 'presentation_multiple') {
            return res.status(400).json({ msg: 'Multi-file upload is supported only for "ebook", "quiz", or "presentation_multiple" types.' });
        }

        const uploadedContents = [];
        const failedUploads = [];

        for (const file of req.files) {
            try {
                // File extension validation here again, assuming Multer's fileFilter might be broad
                const allowedDocExtensions = {
                    'ebook': ['.ppt', '.pptx', '.pdf', '.doc', '.docx'],
                    'quiz': ['.pdf', '.doc', '.docx'],
                    'presentation_multiple': ['.ppt', '.pptx', '.pdf', '.doc', '.docx']
                };
                const validExtensions = allowedDocExtensions[type];

                const fileExtension = file.originalname.split('.').pop().toLowerCase();
                if (!validExtensions.includes(`.${fileExtension}`)) {
                    fs.unlinkSync(file.path);
                    failedUploads.push({ filename: file.originalname, error: `Invalid file type. Only ${validExtensions.join(', ')} are allowed for ${type}.` });
                    continue;
                }

                // Generate a unique public ID for Cloudinary
                const cleanedFilename = file.originalname.split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '');
                const publicIdPrefix = `course_content/documents/${cleanedFilename}_${Date.now()}`;

                const uploadOptions = {
                    resource_type: 'raw', // Upload original as raw, then convert
                    folder: 'course_content/documents', // Folder on Cloudinary
                    public_id: publicIdPrefix, // Unique public ID for this file
                    format: 'pdf', // CRITICAL: Tell Cloudinary to convert it to PDF
                };

                const result = await cloudinary.uploader.upload(file.path, uploadOptions);

                fs.unlinkSync(file.path); // Delete local file after upload

                if (!result || !result.secure_url) {
                    failedUploads.push({ filename: file.originalname, error: 'Failed to upload file to Cloudinary (no secure_url).' });
                    continue;
                }

                const content = new Content({
                    title: file.originalname.split('.')[0], // Use original filename as title
                    // Store as 'ebook' if the frontend sent 'presentation_multiple'
                    type: type === 'presentation_multiple' ? 'ebook' : type,
                    fileUrl: result.secure_url, // This URL is now directly to the PDF version
                    grade: Number(grade),
                    session: Number(session),
                    uploadedBy: req.user.id
                });
                await content.save();
                uploadedContents.push(content);

            } catch (fileErr) {
                console.error(`Error processing file ${file.originalname}:`, fileErr);
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
                failedUploads.push({ filename: file.originalname, error: fileErr.message });
            }
        }

        if (uploadedContents.length > 0) {
            res.status(201).json({
                msg: 'Multiple contents uploaded successfully',
                contents: uploadedContents,
                failedUploads: failedUploads
            });
        } else {
            res.status(400).json({
                msg: 'No contents were uploaded successfully.',
                failedUploads: failedUploads
            });
        }

    } catch (err) {
        console.error('Server error during multiple content upload:', err);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        // Handle Multer errors specifically (e.g., file size limit exceeded)
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ msg: `File size too large. Maximum allowed size is 500MB.`, error: err.message });
        }
        res.status(500).json({ msg: 'Server error during multiple content upload', error: err.message });
    }
};

// ... (rest of your materialController functions like getAllContent, getContentBySessionAndGrade remain largely the same)
// ensure the helpers getCloudinaryPublicId and getCloudinaryResourceType are correct for videos and documents
// They already seem fine for videos as they check for '/video/upload/'
// and for PDFs from documents, they check for '/image/upload/' and '.pdf'
// The signing logic in getContentBySessionAndGrade should work correctly.



exports.getAllContent = async (req, res) => {
    try {
        const content = await Content.find().populate('uploadedBy', 'name email');
        res.json(content);
    } catch (err) {
        console.error('Error fetching all content:', err);
        res.status(500).json({ msg: 'Error fetching content', error: err.message });
    }
};

// Get Content by Session and Grade (for students) - MODIFIED TO GENERATE SIGNED URLS
exports.getContentBySessionAndGrade = async (req, res) => {
    try {
        const { session, grade } = req.query;

        if (!session || !grade) {
            return res.status(400).json({ msg: 'Session and Grade query parameters are required.' });
        }
        const parsedSession = parseInt(session);
        const parsedGrade = parseInt(grade);

        if (isNaN(parsedSession) || isNaN(parsedGrade)) {
            return res.status(400).json({ msg: 'Session and Grade must be valid numbers.' });
        }

        const contents = await Content.find({
            session: parsedSession,
            grade: parsedGrade
        }).select('-__v');

        if (contents.length === 0) {
            return res.status(200).json([]);
        }

        const contentsWithSignedUrls = contents.map(content => {
            const contentObject = content.toObject();

            if ((contentObject.type === 'ebook' || contentObject.type === 'quiz') && contentObject.fileUrl) {
                const publicId = getCloudinaryPublicId(contentObject.fileUrl);
                const resourceTypeForSigning = getCloudinaryResourceType(contentObject.fileUrl);

                if (publicId) {
                    try {
                        const signedUrl = cloudinary.url(publicId, {
                            resource_type: resourceTypeForSigning, // 'image' for PDF, 'raw' for others
                            secure: true,
                            sign_url: true, // THIS IS THE KEY!
                            expires_at: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
                        });
                        return { ...contentObject, fileUrl: signedUrl };
                    } catch (signError) {
                        console.error(`Error signing URL for public ID ${publicId}:`, signError);
                        return { ...contentObject, fileUrl: null, error: 'Failed to generate signed URL' };
                    }
                }
            }
            return contentObject;
        });

        res.json(contentsWithSignedUrls);
    } catch (err) {
        console.error('Error fetching content by session and grade:', err);
        res.status(500).json({ msg: 'Server Error fetching content', error: err.message });
    }
};


exports.deleteContent = async (req, res) => {
    try {
        const { id } = req.params; // Get the content ID from the URL parameter

        const deletedContent = await Content.findByIdAndDelete(id);

        if (!deletedContent) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        res.status(200).json({ success: true, message: 'Content deleted successfully' });
    } catch (error) {
        console.error('Error deleting content:', error);
        res.status(500).json({ success: false, message: 'Server error during content deletion' });
    }
};
