// controllers/trainerAttendanceController.js

const TrainerAttendanceRequest = require('../models/TrainerAttendanceRequest');
const TrainerAttendance = require('../models/TrainerAttendance');
const User = require('../models/User');
const Notification = require('../models/Notification');
const dayjs = require('dayjs');

// Helper to normalize date to start of UTC day
const normalizeDate = (dateString) => {
    const date = new Date(dateString);
    date.setUTCHours(0, 0, 0, 0);
    return date;
};

// @desc      Trainer marks their attendance via webcam
// @route     POST /api/trainer/trainer-attendance/mark
// @access    Private (Trainer)
exports.markTrainerAttendance = async (req, res) => {
    try {
        const trainerId = req.user.id;
        const { photo, latitude, longitude } = req.body;

        if (!photo || !latitude || !longitude) {
            return res.status(400).json({ msg: 'Missing attendance data: photo, latitude, and longitude are required.' });
        }
        
        const today = normalizeDate(new Date().toISOString());
        const existingAttendance = await TrainerAttendance.findOne({ trainer: trainerId, date: today });

        if (existingAttendance) {
            return res.status(409).json({ msg: `Attendance has already been marked for today. Status: ${existingAttendance.status}` });
        }

        const newAttendance = new TrainerAttendance({
            trainer: trainerId,
            photo,
            location: { latitude, longitude },
            status: 'Pending',
            date: today,
        });

        await newAttendance.save();
        
        res.status(201).json({
            msg: 'Attendance marked successfully. Awaiting admin verification.',
            attendance: newAttendance,
        });

    } catch (err) {
        console.error('Error marking trainer attendance:', err);
        res.status(500).json({ msg: 'Server error marking attendance.' });
    }
};

// @desc      Admin verifies a trainer's "Mark Present" record
// @route     PUT /api/admin/trainer-attendance/:id/verify
// @access    Private (Admin)
exports.verifyTrainerAttendance = async (req, res) => {
    try {
        const attendanceId = req.params.id;
        const { action, remarks } = req.body;
        const adminId = req.user.id;

        if (!action || !['Approved', 'Rejected'].includes(action)) {
            return res.status(400).json({ msg: 'Invalid action. Must be "Approved" or "Rejected".' });
        }

        const attendance = await TrainerAttendance.findById(attendanceId).populate('trainer');
        if (!attendance) {
            return res.status(404).json({ msg: 'Attendance record not found.' });
        }

        // Handles old records that might not have the 'date' field.
        if (!attendance.date) {
            const creationDate = new Date(attendance.createdAt);
            creationDate.setUTCHours(0, 0, 0, 0);
            attendance.date = creationDate;
        }

        if (attendance.status !== 'Pending') {
            return res.status(400).json({ msg: `This attendance has already been reviewed.` });
        }

        attendance.status = action === 'Approved' ? 'P' : 'A';
        attendance.adminRemarks = remarks;
        attendance.reviewedBy = adminId;
        attendance.reviewedAt = new Date();
        await attendance.save();

        await Notification.create({
            userId: attendance.trainer._id,
            onModel: 'User',
            type: 'attendance_verification',
            message: `Your attendance for ${dayjs(attendance.date).format('MMMM D, YYYY')} has been ${action.toLowerCase()}.`,
        });

        res.status(200).json({
            msg: `Attendance ${action.toLowerCase()} successfully.`,
            attendance,
        });

    } catch (err) {
        console.error('Error verifying attendance:', err);
        res.status(500).json({ msg: 'Server error verifying attendance.' });
    }
};

// @desc      Admin reviews a trainer's leave/absence request
// @route     PUT /api/admin/trainer-attendance-requests/:id/review
// @access    Private (Admin)
exports.reviewTrainerAttendanceRequest = async (req, res) => {
    try {
        const requestId = req.params.id;
        const { action, adminRemarks } = req.body;
        const adminId = req.user.id;

        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({ msg: 'Invalid action. Must be "approve" or "reject".' });
        }

        const request = await TrainerAttendanceRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ msg: 'Attendance request not found.' });
        }

        if (request.status !== 'Pending') {
            return res.status(400).json({ msg: `This request has already been ${request.status.toLowerCase()}.` });
        }

        let attendanceStatus;
        if (action === 'approve') {
            request.status = 'Approved';
            if (request.requestType === 'lateArrival' || request.requestType === 'earlyDeparture') {
                attendanceStatus = 'P';
            } else if (request.requestType === 'absence') {
                attendanceStatus = 'L';
            }
        } else {
            request.status = 'Rejected';
            attendanceStatus = 'A';
        }

        request.adminRemarks = adminRemarks;
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        await request.save();

        // *** THIS IS THE CORE FIX ***
        // It now correctly uses `date: request.date` to create or update the attendance record
        // for the specific day of the leave request.
        const attendanceRecord = await TrainerAttendance.findOneAndUpdate(
            { trainer: request.trainer, date: request.date },
            { 
                $set: { 
                    status: attendanceStatus, 
                    adminRemarks: `Request reviewed: ${adminRemarks || 'N/A'}`,
                    reviewedBy: adminId,
                    reviewedAt: new Date()
                } 
            },
            { upsert: true, new: true, runValidators: true }
        );

        await Notification.create({
            userId: request.trainer,
            onModel: 'User',
            type: 'attendance_request_review',
            message: `Your attendance request for ${dayjs(request.date).format('MMMM D, YYYY')} has been ${request.status.toLowerCase()}.`,
        });

        res.status(200).json({
            msg: `Request ${request.status.toLowerCase()} successfully. Trainer attendance marked as '${attendanceStatus}'.`,
            request: request,
            attendanceRecord: attendanceRecord,
        });

    } catch (err) {
        console.error('Error reviewing trainer attendance request:', err);
        res.status(500).json({ msg: 'Server error reviewing request.' });
    }
};

// @desc      Get a trainer's own attendance history for their calendar
// @route     GET /api/trainer/attendance-history
// @access    Private (Trainer)
exports.getMyTrainerAttendanceHistory = async (req, res) => {
    try {
        const trainerId = req.user.id;
        const history = await TrainerAttendance.find({ trainer: trainerId })
            .sort({ date: -1 });
        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching trainer attendance history:', error);
        res.status(500).json({ message: 'Server error fetching trainer attendance history.' });
    }
};


// Other required functions
exports.requestTrainerAttendance = async (req, res) => {
    try {
        const { date, requestType, remarks, time } = req.body;
        const trainerId = req.user.id;

        if (!date || !requestType) {
            return res.status(400).json({ msg: 'Date and request type are required.' });
        }
        if ((requestType === 'lateArrival' || requestType === 'earlyDeparture') && !time) {
            return res.status(400).json({ msg: 'Time is required for late arrival or early departure requests.' });
        }

        const trainer = await User.findById(trainerId);
        if (!trainer || trainer.role !== 'trainer') {
            return res.status(403).json({ msg: 'Only trainers can request attendance.' });
        }

        const normalizedDate = normalizeDate(date);
        const existingRequest = await TrainerAttendanceRequest.findOne({ trainer: trainerId, date: normalizedDate });

        if (existingRequest) {
            return res.status(409).json({ msg: `An attendance request for ${dayjs(normalizedDate).format('MMMM D, YYYY')} already exists.` });
        }

        const newRequest = new TrainerAttendanceRequest({
            trainer: trainerId,
            date: normalizedDate,
            requestType,
            remarks: remarks || '',
            time: (requestType === 'lateArrival' || requestType === 'earlyDeparture') ? time : undefined,
            status: 'Pending'
        });

        await newRequest.save();

        res.status(201).json({
            msg: 'Attendance request submitted successfully.',
            request: newRequest
        });

    } catch (err) {
        console.error('Error submitting trainer attendance request:', err);
        res.status(500).json({ msg: 'Server error submitting attendance request.' });
    }
};

exports.getMyTrainerAttendanceRequests = async (req, res) => {
    try {
        const trainerId = req.user.id;
        const requests = await TrainerAttendanceRequest.find({ trainer: trainerId }).populate('trainer', 'name email').sort({ date: -1 });
        res.json({ requests });
    } catch (err) {
        res.status(500).json({ msg: 'Server error fetching requests.' });
    }
};

exports.getAllTrainerAttendanceRequests = async (req, res) => {
    try {
        const requests = await TrainerAttendanceRequest.find({}).populate('trainer', 'name email').populate('reviewedBy', 'name email').sort({ createdAt: -1 });
        res.json({ requests });
    } catch (err) {
        res.status(500).json({ msg: 'Server error fetching requests.' });
    }
};

exports.getTrainerAttendanceHistory = async (req, res) => {
    try {
        const { trainerId } = req.params;
        const history = await TrainerAttendance.find({ trainer: trainerId }).sort({ date: -1 }).populate('trainer', 'name');
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getTrainerAttendance = async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        }
        const attendanceRecords = await TrainerAttendance.find(query).populate('trainer', 'name profilePicture').sort({ createdAt: -1 });
        res.status(200).json(attendanceRecords);
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};