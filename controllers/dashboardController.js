// controllers/dashboardController.js

const School = require('../models/School');
const User = require('../models/User');
const Content = require('../models/Content');
const { Types } = require('mongoose');

// @desc    Get total counts for schools, trainers, and students
// @route   GET /api/admin/dashboard/user-counts
// @access  Private (Admin)
exports.getUserCounts = async (req, res) => {
    try {
        const totalSchools = await School.countDocuments();
        const totalTrainers = await User.countDocuments({ role: 'trainer' });
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalAdmins = await User.countDocuments({ role: 'admin' });

        res.json({
            totalSchools,
            totalTrainers,
            totalStudents,
            totalAdmins
        });
    } catch (err) {
        console.error('Error fetching user counts:', err);
        res.status(500).json({ msg: 'Server error fetching user counts' });
    }
};

// @desc    Get new user counts over a period (e.g., last 7 days)
// @route   GET /api/admin/dashboard/new-users-trend
// @access  Private (Admin)
exports.getNewUserTrend = async (req, res) => {
    try {
        const { period = '7d' } = req.query;
        let startDate = null;
        const now = new Date();

        switch (period) {
            case '7d':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case '30d':
                startDate = new Date(now.setDate(now.getDate() - 30));
                break;
            case '90d':
                startDate = new Date(now.setDate(now.getDate() - 90));
                break;
            case '6m':
                startDate = new Date(now.setMonth(now.getMonth() - 6));
                break;
            case '1y':
                startDate = new Date(now.setFullYear(now.getFullYear() - 1));
                break;
            case 'all':
                // For "all time", we don't set a start date, so all users will be included.
                break;
            default:
                startDate = new Date(now.setDate(now.getDate() - 7));
        }

        const matchStage = startDate ? { createdAt: { $gte: startDate } } : {};

        // Added a check to ensure we only count users with roles
        const newUsers = await User.aggregate([
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        role: "$role"
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: "$_id.date",
                    users: {
                        $push: {
                            role: "$_id.role",
                            count: "$count"
                        }
                    }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.json(newUsers);
    } catch (err) {
        console.error('Error fetching new user trend:', err);
        res.status(500).json({ msg: 'Server error fetching new user trend' });
    }
};

// @desc    Get content counts for each grade and type
// @route   GET /api/admin/dashboard/content-by-grade
// @access  Private (Admin)
exports.getContentCountsByGrade = async (req, res) => {
    try {
        const contentCounts = await Content.aggregate([
            {
                $group: {
                    _id: { grade: "$grade", type: "$type" },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: "$_id.grade",
                    contentTypes: {
                        $push: {
                            type: "$_id.type",
                            count: "$count"
                        }
                    },
                    totalContent: { $sum: "$count" }
                }
            },
            {
                $project: {
                    _id: 0,
                    grade: "$_id",
                    contentTypes: 1,
                }
            },
            {
                $sort: { grade: 1 }
            }
        ]);

        res.json(contentCounts);
    } catch (err) {
        console.error('Error fetching content counts by grade:', err);
        res.status(500).json({ msg: 'Server error fetching content counts' });
    }
};

// @desc    Get student counts by school, gender, and grade
// @route   GET /api/admin/dashboard/student-counts-by-school
// @access  Private (Admin)
exports.getStudentCountsBySchool = async (req, res) => {
    try {
        const studentCounts = await User.aggregate([
            { $match: { role: 'student' } },
            {
                $group: {
                    _id: { school: "$school", grade: "$grade", gender: "$gender" },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: "$_id.school",
                    grades: {
                        $push: {
                            grade: "$_id.grade",
                            genderCounts: {
                                gender: "$_id.gender",
                                count: "$count"
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    school: "$_id",
                    grades: 1
                }
            },
            {
                $sort: { school: 1 }
            }
        ]);
        res.json(studentCounts);
    } catch (err) {
        console.error('Error fetching student counts by school:', err);
        res.status(500).json({ msg: 'Server error fetching student counts by school.' });
    }
};