// controllers/doubtController.js
const DoubtSession = require('../models/Doubt'); // Assuming 'Doubt.js' is your DoubtSession model file
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Session = require('../models/Session'); // To get session details
const School = require('../models/School'); // To get school details to find ObjectId from name
const cloudinary = require('../config/cloudinary'); // Assuming you have Cloudinary config
const multer = require('multer');
const path = require('path');
const { getIo } = require('../utils/socket'); // Import the Socket.IO instance
const mongoose = require('mongoose'); // Import mongoose to use isValidObjectId if needed, and for Session subdocument lookup
const fs = require('fs'); // Moved here for scope
const asyncHandler = require('express-async-handler');

// --- Multer setup for temporary file upload before Cloudinary ---
// Ensure 'uploads/' directory exists in your project root
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|ppt|pptx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only images (jpeg, png, gif) and documents (pdf, doc, docx, ppt, pptx) are allowed!'), false);
    }
};

const uploadAttachment = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Helper to upload to Cloudinary
const uploadToCloudinary = async (filePath) => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: 'doubt_attachments' // Specific folder in Cloudinary
        });
        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw new Error('Failed to upload attachment to cloud storage.');
    } finally {
        // Clean up the local file after upload
        if (filePath) {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Failed to delete local file:', err);
            });
        }
    }
};

// --- CONTROLLER FUNCTIONS ---

// @desc    Upload an attachment for a doubt session message
// @route   POST /api/doubts/upload-attachment
// @access  Private (Student/Trainer)
exports.uploadDoubtAttachment = (req, res, next) => {
    uploadAttachment.single('attachment')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ msg: err.message });
        } else if (err) {
            return res.status(400).json({ msg: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded.' });
        }

        try {
            const attachmentUrl = await uploadToCloudinary(req.file.path);
            res.status(200).json({ attachmentUrl });
        } catch (error) {
            console.error('Error uploading doubt attachment:', error);
            res.status(500).json({ msg: 'Server error during file upload.', error: error.message });
        }
    });
};

// @desc    Get a list of trainers available for doubt sessions (filtered by student's school/grade)
// @route   GET /api/doubts/trainers
// @access  Private (Student)
exports.getAvailableTrainers = async (req, res) => {
    try {
        const student = await User.findById(req.user.id).select('school grade');
        if (!student || !student.school || student.grade === null) {
            return res.status(404).json({ msg: 'Student profile is incomplete. Please ensure your school and grade are set.' });
        }

        const studentSchoolName = student.school;
        const studentGrade = student.grade;

        // Fix: Query the User model directly using the school name (string)
        // Mongoose automatically checks if the array contains the specified string.
        const trainers = await User.find({
            role: 'trainer',
            // Correct query: Use the school name directly as a search value in the assignedSchools array
            assignedSchools: studentSchoolName,
            assignedGrades: studentGrade
        }).select('_id name profilePicture subject');

        if (!trainers || trainers.length === 0) {
            return res.status(200).json([]);
        }

        res.json(trainers);

    } catch (error) {
        console.error('Error fetching available trainers:', error);
        res.status(500).json({ msg: 'Server error fetching trainers.', error: error.message });
    }
};



// @desc    Get academic sessions/topics for a specific grade
// @route   GET /api/doubts/sessions-for-grade/:grade
// @access  Private (Student)
exports.getSessionsForGrade = async (req, res) => {
    try {
        const { grade } = req.params;
        const studentGrade = parseInt(grade);

        if (isNaN(studentGrade)) {
            return res.status(400).json({ msg: 'Invalid grade provided.' });
        }

        // Find the Session document for the specific grade
        const sessionDoc = await Session.findOne({ grade: studentGrade }).select('sessions');

        if (!sessionDoc) {
            return res.status(404).json({ msg: `No sessions found for grade ${studentGrade}.` });
        }

        res.json(sessionDoc.sessions); // Return the array of session objects

    } catch (error) {
        console.error('Error fetching sessions for grade:', error);
        res.status(500).json({ msg: 'Server error fetching sessions.' });
    }
};


// @desc    Initiate a new doubt session (Trainer or AI)
// @route   POST /api/doubts/initiate
// @access  Private (Student)
exports.initiateDoubtSession = async (req, res) => {
    const { doubtType, trainerId, sessionId, initialDoubtText, attachmentUrl } = req.body;

    if (!doubtType || !initialDoubtText) {
        return res.status(400).json({ msg: 'Doubt type and initial doubt text are required.' });
    }

    const studentId = req.user.id; // From auth middleware
    // student.school will be a string (e.g., "Green View High School")
    const student = await User.findById(studentId).select('name school grade');
    if (!student) {
        return res.status(404).json({ msg: 'Authenticated student not found.' });
    }

    // --- Start of CRITICAL FIX: Retrieve the School ObjectId from the School name ---
    let schoolObjectId = null;
    if (student.school) { // Check if student.school (the string name) exists
        const schoolDoc = await School.findOne({ schoolName: student.school });
        if (!schoolDoc) {
            console.warn(`Warning: Student ${student.name} (ID: ${studentId}) has school "${student.school}" which was not found in the School collection. Cannot initiate doubt session.`);
            // It's crucial to return an error here if the associated school isn't found,
            // as the DoubtSession model's 'school' field is required and expects an ObjectId.
            return res.status(400).json({ msg: `The school "${student.school}" associated with your account could not be found in the system. Please contact support.` });
        }
        schoolObjectId = schoolDoc._id; // This is the ObjectId that DoubtSession model needs
    } else {
        // If student.school is not set in the User profile, and DoubtSession requires it.
        return res.status(400).json({ msg: 'Your student profile is missing assigned school information. Please contact support.' });
    }
    // --- End of CRITICAL FIX ---


    try {
        let doubtSession;
        let initialChatMessage;

        if (doubtType === 'trainer') {
            if (!trainerId || !sessionId) {
                return res.status(400).json({ msg: 'Trainer ID and Session ID are required for trainer doubts.' });
            }

            const trainer = await User.findById(trainerId).select('name role');
            if (!trainer || trainer.role !== 'trainer') {
                return res.status(400).json({ msg: 'Invalid trainer selected.' });
            }

            // Verify the sessionId actually exists within a Session document
            const sessionDoc = await Session.findOne({ 'sessions._id': sessionId });
            if (!sessionDoc) {
                return res.status(400).json({ msg: 'Invalid session selected.' });
            }
            // Optional: You might want to retrieve details of the specific session subdocument here:
            // const specificSession = sessionDoc.sessions.id(sessionId);
            // if (!specificSession) {
            //    return res.status(400).json({ msg: 'Specific session topic not found within the selected session group.' });
            // }


            doubtSession = new DoubtSession({
                student: student.id,
                trainer: trainer._id,
                grade: student.grade,
                school: schoolObjectId, // Use the fetched ObjectId here
                session: sessionId, // This is the ObjectId of the specific subdocument (topic)
                initialDoubtText,
                doubtType: 'trainer',
                status: 'pending',
                lastMessageAt: new Date()
            });
            await doubtSession.save(); // This line (or lines near it) caused the original error for 'trainer' type

            initialChatMessage = new ChatMessage({
                doubtSession: doubtSession._id,
                sender: student.id,
                senderRole: 'student',
                messageText: initialDoubtText,
                attachmentUrl
            });
            await initialChatMessage.save();

            // Emit notification to the trainer via Socket.IO
            const io = getIo();
            io.to(trainerId.toString()).emit('newDoubtSession', {
                doubtSessionId: doubtSession._id,
                studentName: student.name,
                initialDoubt: initialDoubtText.substring(0, 100) + (initialDoubtText.length > 100 ? '...' : ''),
                // For notification, you can still use the student's stored school name (string)
                schoolName: student.school,
                grade: student.grade
            });

            res.status(201).json({
                msg: 'Doubt session initiated with trainer.',
                doubtSessionId: doubtSession._id,
                initialMessage: initialChatMessage
            });

        } else if (doubtType === 'ai') {
            doubtSession = new DoubtSession({
                student: student.id,
                grade: student.grade,
                school: schoolObjectId, // Use the fetched ObjectId here
                initialDoubtText,
                doubtType: 'ai',
                status: 'in_progress', // AI doubt is in progress until answered
                lastMessageAt: new Date()
            });
            await doubtSession.save(); // This line (or lines near it) caused the original error for 'ai' type

            // Create initial message from student
            initialChatMessage = new ChatMessage({
                doubtSession: doubtSession._id,
                sender: student.id,
                senderRole: 'student',
                messageText: initialDoubtText,
                attachmentUrl
            });
            await initialChatMessage.save();

            // --- AI Integration Logic ---
            // This is a placeholder for your actual AI service call
            let aiResponseText = "I'm processing your doubt..."; // Default immediate response

            // Simulate AI processing and response
            setTimeout(async () => {
                try {
                    // In a real app, call your AI API here (e.g., Gemini, OpenAI)
                    // const aiServiceResponse = await axios.post('YOUR_AI_SERVICE_URL', {
                    //    prompt: initialDoubtText,
                    //    attachments: attachmentUrl ? [attachmentUrl] : []
                    // });
                    // aiResponseText = aiServiceResponse.data.answer;
                    aiResponseText = `Hello ${student.name}, I'm the AI assistant! Regarding your doubt: "${initialDoubtText}", here's what I found... [Simulated AI Answer based on your query]. Please provide feedback if this was helpful.`;

                    const aiChatMessage = new ChatMessage({
                        doubtSession: doubtSession._id,
                        sender: null, // No specific user ID for AI
                        senderRole: 'ai',
                        messageText: aiResponseText,
                        attachmentUrl: null // AI typically doesn't send attachments
                    });
                    await aiChatMessage.save();

                    doubtSession.status = 'resolved'; // Mark AI doubt as resolved after first answer
                    doubtSession.lastMessageAt = new Date();
                    await doubtSession.save();

                    // Emit message to student's specific room via Socket.IO
                    const io = getIo();
                    io.to(doubtSession._id.toString()).emit('newMessage', aiChatMessage);

                } catch (aiError) {
                    console.error('AI Service Error:', aiError);
                    const errorChatMessage = new ChatMessage({
                        doubtSession: doubtSession._id,
                        sender: null,
                        senderRole: 'system',
                        messageText: 'AI encountered an error. Please try again later or contact a trainer.',
                        attachmentUrl: null
                    });
                    await errorChatMessage.save();
                    const io = getIo();
                    io.to(doubtSession._id.toString()).emit('newMessage', errorChatMessage);
                    doubtSession.status = 'cancelled';
                    doubtSession.lastMessageAt = new Date();
                    await doubtSession.save();
                }
            }, 5000); // Simulate 5-second AI processing time

            res.status(201).json({
                msg: 'Doubt session initiated with AI.',
                doubtSessionId: doubtSession._id,
                initialMessage: initialChatMessage,
                aiInitialResponse: aiResponseText // Send initial placeholder response
            });

        } else {
            return res.status(400).json({ msg: 'Invalid doubt type.' });
        }

    } catch (error) {
        console.error('Error initiating doubt session:', error);
        res.status(500).json({ msg: 'Server error during doubt session initiation.', error: error.message });
    }
};

// @desc    Get chat history for a specific doubt session
// @route   GET /api/doubts/:doubtSessionId/messages
// @access  Private (Student/Trainer - must be participant)
exports.getDoubtSessionMessages = async (req, res) => {
    try {
        const { doubtSessionId } = req.params;
        // const userId = req.user.id; // Not needed, already checked by middleware
        const doubtSession = req.doubtSession; // Provided by isParticipantInDoubtSession middleware

        // Authorization check is now handled by isParticipantInDoubtSession middleware
        // The middleware already ensured req.doubtSession exists and the user is authorized.

        const messages = await ChatMessage.find({ doubtSession: doubtSessionId })
            .sort('createdAt')
            .populate('sender', 'name profilePicture'); // Populate sender's name and picture

        res.json(messages);

    } catch (error) {
        console.error('Error fetching doubt session messages:', error);
        res.status(500).json({ msg: 'Server error fetching messages.', error: error.message });
    }
};

// @desc    Send a new message in a doubt session
// @route   POST /api/doubts/:doubtSessionId/messages
// @access  Private (Student/Trainer - must be participant)
exports.sendDoubtMessage = async (req, res) => {
    const { doubtSessionId } = req.params;
    const { messageText, attachmentUrl } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!messageText && !attachmentUrl) {
        return res.status(400).json({ msg: 'Message text or attachment URL is required.' });
    }

    try {
        const doubtSession = req.doubtSession;

        if (doubtSession.status === 'resolved' || doubtSession.status === 'closed' || doubtSession.status === 'cancelled') {
            if (doubtSession.doubtType === 'ai' && userRole === 'student') {
                doubtSession.status = 'in_progress';
                doubtSession.lastMessageAt = new Date();
                await doubtSession.save();
            } else {
                return res.status(400).json({ msg: 'Cannot send messages to a closed or resolved session.' });
            }
        }

        const chatMessage = new ChatMessage({
            doubtSession: doubtSession._id,
            sender: userId,
            senderRole: userRole,
            messageText,
            attachmentUrl
        });
        await chatMessage.save();

        doubtSession.lastMessageAt = new Date();
        if (userRole === 'trainer' && doubtSession.status === 'pending') {
            doubtSession.status = 'in_progress';
        }
        await doubtSession.save();

        const populatedMessage = await ChatMessage.findById(chatMessage._id).populate('sender', 'name profilePicture');

        const io = getIo();
        // This sends the message to the chat window for all participants
        io.to(doubtSessionId).emit('newMessage', populatedMessage);

        // --- NEW: LOGIC TO SEND A SPECIFIC NOTIFICATION TO THE STUDENT ---
        if (userRole === 'trainer') {
            const studentId = doubtSession.student.toString();

            // This sends a notification to the student's personal notification bell
            io.to(studentId).emit('newNotification', {
                id: new mongoose.Types.ObjectId(), // Generate a unique ID for the notification
                type: 'doubt_reply', // Specific type for the frontend to handle
                message: `You have a new reply from ${req.user.name}`,
                question: doubtSession.initialDoubtText.substring(0, 50) + '...',
                timeAsked: new Date(),
                read: false,
                relatedData: {
                    doubtSessionId: doubtSession._id // Link back to the chat
                }
            });
        }        if (doubtSession.doubtType === 'ai' && userRole === 'student') {
            const messages = await ChatMessage.find({ doubtSession: doubtSessionId }).sort('createdAt');
            const conversationHistory = messages.map(msg => ({
                role: msg.senderRole === 'student' ? 'user' : 'model',
                content: msg.messageText
            }));

            setTimeout(async () => {
                try {
                    const aiResponseText = `(AI Follow-up to "${messageText}") Here’s more clarification: ... [Simulated AI Answer].`;

                    const aiChatMessage = new ChatMessage({
                        doubtSession: doubtSession._id,
                        sender: null,
                        senderRole: 'ai',
                        messageText: aiResponseText,
                        attachmentUrl: null
                    });
                    await aiChatMessage.save();

                    doubtSession.lastMessageAt = new Date();
                    doubtSession.status = 'resolved';
                    await doubtSession.save();

                    io.to(doubtSession._id.toString()).emit('newMessage', aiChatMessage);

                } catch (aiError) {
                    console.error('AI Service Error on follow-up:', aiError);
                    const errorChatMessage = new ChatMessage({
                        doubtSession: doubtSession._id,
                        sender: null,
                        senderRole: 'system',
                        messageText: 'AI encountered an error processing your follow-up. Please try again.',
                        attachmentUrl: null
                    });
                    await errorChatMessage.save();
                    io.to(doubtSession._id.toString()).emit('newMessage', errorChatMessage);
                }
            }, 3000);
        }

        res.status(201).json(populatedMessage);

    } catch (error) {
        console.error('Error sending doubt message:', error);
        res.status(500).json({ msg: 'Server error sending message.', error: error.message });
    }
};


// @desc    Close/resolve a doubt session
// @route   PUT /api/doubts/:doubtSessionId/close
// @access  Private (Student/Trainer - must be participant)
exports.closeDoubtSession = async (req, res) => {
    try {
        const { doubtSessionId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const doubtSession = req.doubtSession; // Provided by isParticipantInDoubtSession middleware

        // Authorization check is now handled by isParticipantInDoubtSession middleware
        // The middleware already ensured req.doubtSession exists and the user is authorized.

        if (doubtSession.status === 'closed' || doubtSession.status === 'resolved' || doubtSession.status === 'cancelled') {
            return res.status(400).json({ msg: 'Doubt session is already closed, resolved, or cancelled.' });
        }

        // Only student or trainer/admin who is part of the session can close it
        const isStudentParticipant = doubtSession.student.equals(userId);
        const isTrainerParticipant = doubtSession.trainer && doubtSession.trainer.equals(userId);
        const isAdmin = userRole === 'admin';

        if (!isAdmin && !isStudentParticipant && !isTrainerParticipant) {
             return res.status(403).json({ msg: 'Only the student who opened the doubt, the assigned trainer, or an admin can close this session.' });
        }

        doubtSession.status = 'closed';
        await doubtSession.save();

        // Notify participants via Socket.IO
        const io = getIo();
        io.to(doubtSessionId).emit('doubtSessionClosed', { doubtSessionId, closedBy: req.user.name, status: 'closed' });

        res.json({ msg: 'Doubt session closed successfully.', doubtSession });

    } catch (error) {
        console.error('Error closing doubt session:', error);
        res.status(500).json({ msg: 'Server error closing session.', error: error.message });
    }
};

// @desc    Get all doubt sessions for the authenticated student
// @route   GET /api/doubts/my-doubts
// @access  Private (Student)
exports.getMyDoubtSessions = async (req, res) => {
    try {
        const studentId = req.user.id;
        const doubtSessions = await DoubtSession.find({ student: studentId })
            .populate('trainer', 'name profilePicture') // Populate trainer info if trainer doubt
            .populate('session', 'grade sessions.name sessions.topicName') // Populate session info (the main Session doc)
            .populate('school', 'schoolName') // Populate school name
            .sort('-lastMessageAt'); // Sort by most recent activity

        res.json(doubtSessions);
    } catch (error) {
        console.error('Error fetching student doubt sessions:', error);
        res.status(500).json({ msg: 'Server error fetching doubt sessions.' });
    }
};

// @desc    Get doubt sessions for trainers (pending/in_progress)
// @route   GET /api/doubts/trainer/my-doubts
// @access  Private (Trainer)
exports.getTrainerDoubtSessions = asyncHandler(async (req, res) => {
  try {
    console.log('getTrainerDoubtSessions: Initiated request.');
        console.log('getTrainerDoubtSessions: Authenticated user (trainer):', req.user); // Check req.user content

   const trainerId = new mongoose.Types.ObjectId(req.user._id);

    console.log('🔍 Fetching sessions for trainer:', trainerId);

    const sessions = await DoubtSession.find({
      trainer: trainerId,
      status: { $in: ['pending', 'open'] },
    })
      .populate('student', 'name email')
      .populate('session', 'title')
      .sort({ updatedAt: -1 });

    console.log('✅ Doubt sessions found:', sessions.length);

    res.status(200).json(sessions);
  } catch (error) {
    console.error('❌ Error fetching trainer sessions:', error);
    res.status(500).json({ message: 'Server error while fetching sessions' });
  }
});


// @desc    Get all doubt sessions (Admin view)
// @route   GET /api/doubts/admin/all-doubts
// @access  Private (Admin)
exports.getAllDoubtSessions = async (req, res) => {
    try {
        const doubtSessions = await DoubtSession.find()
            .populate('student', 'name school grade')
            .populate('trainer', 'name')
            .populate('school', 'schoolName')
            .populate('session', 'grade sessions.name sessions.topicName')
            .sort('-lastMessageAt');

        res.json(doubtSessions);
    } catch (error) {
        console.error('Error fetching all doubt sessions (Admin):', error);
        res.status(500).json({ msg: 'Server error fetching all doubt sessions.' });
    }
};

// @desc    Submit AI feedback for a doubt session
// @route   POST /api/doubts/:doubtSessionId/feedback/ai
// @access  Private (Student)
exports.submitAiFeedback = async (req, res) => {
    const { doubtSessionId } = req.params;
    const { helpful, feedbackText } = req.body;
    const studentId = req.user.id;

    if (typeof helpful !== 'boolean') {
        return res.status(400).json({ msg: 'Helpful field must be a boolean.' });
    }

    try {
        const doubtSession = await DoubtSession.findOne({ _id: doubtSessionId, student: studentId, doubtType: 'ai' });

        if (!doubtSession) {
            return res.status(404).json({ msg: 'AI doubt session not found or you are not the student.' });
        }

        doubtSession.aiHelpful = helpful;
        doubtSession.aiFeedbackText = feedbackText || null;
        await doubtSession.save();

        res.json({ msg: 'AI feedback submitted successfully.', doubtSession });

    } catch (error) {
        console.error('Error submitting AI feedback:', error);
        res.status(500).json({ msg: 'Server error submitting AI feedback.', error: error.message });
    }
};

exports.getActiveStudentDoubts = async (req, res) => {
    try {
        const studentId = req.user.id;
        const doubtSessions = await DoubtSession.find({
            student: studentId,
            status: { $in: ['pending', 'in_progress'] } // Define what 'active' means for you
        })
        .populate('trainer', 'name profilePicture')
        .populate('school', 'schoolName')
        .populate('session', 'grade sessions.name sessions.topicName')
        .sort('-lastMessageAt');

        res.json(doubtSessions);
    } catch (error) {
        console.error('Error fetching active student doubt sessions:', error);
        res.status(500).json({ msg: 'Server error fetching active doubt sessions.' });
    }
};