const User = require('../models/User');
const School = require('../models/School');
const ClassDetails = require('../models/ClassDetails');
const Timetable = require('../models/TimeTable'); // Assuming this model has recurring schedule info
const moment = require('moment'); // Using moment for robust date/week calculations

// Helper to get start and end dates of a month
const getMonthDateRange = (year, month) => {
    const startDate = new Date(year, month - 1, 1); // Month is 0-indexed for Date object
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of the month
    return { startDate, endDate };
};

// Helper to get all dates for a specific day of the week within a month
const getDatesForDayOfWeekInMonth = (year, month, dayOfWeekName) => {
    const dates = [];
    // Moment.js day() is 0 (Sunday) to 6 (Saturday)
    const dayOfWeekIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(dayOfWeekName);
    if (dayOfWeekIndex === -1) {
        console.warn(`Invalid dayOfWeekName provided: ${dayOfWeekName}`);
        return dates; // Invalid day name
    }

    const current = moment([year, month - 1, 1]); // Month is 0-indexed for moment
    const end = moment(current).endOf('month');

    // Find the first occurrence of the dayOfWeek in the month
    // Using startOf('week') or day(dayOfWeekIndex) can be more direct
    let firstOccurrence = current.clone().day(dayOfWeekIndex);
    if (firstOccurrence.month() !== current.month() && firstOccurrence.date() > 7) {
        // If first occurrence is in the previous month, or too far into current month's *next* week,
        // move to the next week's occurrence in the current month.
        firstOccurrence.add(7, 'days');
    }
    // Ensure we start from the first day of the specific dayOfWeek within the current month
    if (firstOccurrence.isBefore(current, 'day')) {
        firstOccurrence.add(7, 'days');
    }


    // Add all occurrences within the month
    while (firstOccurrence.isSameOrBefore(end, 'day')) {
        dates.push(firstOccurrence.clone().toDate());
        firstOccurrence.add(7, 'days');
    }
    return dates;
};

// Helper to determine the "Week N" for a given date within its month
const getWeekKeyOfMonth = (date) => {
    const momentDate = moment(date);
    // This calculation ensures consistency with how weeks are often counted
    // relative to the start of the month, not calendar weeks.
    const dayOfMonth = momentDate.date(); // 1-31
    if (dayOfMonth >= 1 && dayOfMonth <= 7) return 'Week 1';
    if (dayOfMonth >= 8 && dayOfMonth <= 14) return 'Week 2';
    if (dayOfMonth >= 15 && dayOfMonth <= 21) return 'Week 3';
    if (dayOfMonth >= 22 && dayOfMonth <= 28) return 'Week 4';
    if (dayOfMonth >= 29 && dayOfMonth <= 31) return 'Week 5';
    return 'Unknown Week'; // Should ideally not happen for valid dates within month
};


exports.getSchoolMonthlyReport = async (req, res) => {
    try {
        const { schoolId, month, year } = req.query; // Expect schoolId, month (1-12), year

        if (!schoolId || !month || !year) {
            return res.status(400).json({ msg: 'School ID, month, and year are required.' });
        }

        const { startDate, endDate } = getMonthDateRange(parseInt(year), parseInt(month));

        const school = await School.findById(schoolId);
        if (!school) {
            return res.status(404).json({ msg: 'School not found.' });
        }

        // --- Fetch Student Data ---
        // Your student fetching and grouping logic is already good.
        const students = await User.find({ role: 'student', school: school._id });
        const totalStudents = students.length;
        const totalGirls = students.filter(student => student.gender === 'Female').length;
        const totalBoys = students.filter(student => student.gender === 'Male').length;

        const studentsByGradeAndSection = {};
        students.forEach(student => {
            const grade = student.grade;
            const section = student.section || 'N/A';

            if (!studentsByGradeAndSection[grade]) {
                studentsByGradeAndSection[grade] = {};
            }
            if (!studentsByGradeAndSection[grade][section]) {
                studentsByGradeAndSection[grade][section] = {
                    total: 0,
                    boys: 0,
                    girls: 0
                };
            }
            studentsByGradeAndSection[grade][section].total++;
            if (student.gender === 'Male') {
                studentsByGradeAndSection[grade][section].boys++;
            } else if (student.gender === 'Female') {
                studentsByGradeAndSection[grade][section].girls++;
            }
        });

        // Initialize report structure with student counts and all potential weeks
        const reportByGrade = {};
        for (const grade in studentsByGradeAndSection) {
            for (const section in studentsByGradeAndSection[grade]) {
                if (!reportByGrade[grade]) {
                    reportByGrade[grade] = {};
                }
                reportByGrade[grade][section] = {
                    grade: parseInt(grade),
                    section: section,
                    noOfStudents: studentsByGradeAndSection[grade][section].total,
                    boys: studentsByGradeAndSection[grade][section].boys,
                    girls: studentsByGradeAndSection[grade][section].girls,
                    scheduledSessions: 0, // Will be filled from Timetable
                    conductedSessionsCount: 0,
                    weeklyDetails: {
                        'Week 1': [],
                        'Week 2': [],
                        'Week 3': [],
                        'Week 4': [],
                        'Week 5': [] // Accounts for months with a 5th week of a day
                    },
                    notConductedSessions: [] // For sessions scheduled but not found in ClassDetails
                };
            }
        }

        // --- Fetch Conducted Sessions (ClassDetails) ---
        const conductedSessions = await ClassDetails.find({
            school: school._id,
            date: { $gte: startDate, $lte: endDate }
        })
        .populate('trainer', 'name')
        .sort({ date: 1, grade: 1, section: 1, sessionNumber: 1 });

        // Populate conducted sessions and assign to weeks
        conductedSessions.forEach(session => {
            const grade = session.grade.toString();
            const section = session.section || 'N/A';

            if (reportByGrade[grade] && reportByGrade[grade][section]) {
                reportByGrade[grade][section].conductedSessionsCount++;

                const sessionDate = new Date(session.date);
                const weekKey = getWeekKeyOfMonth(sessionDate); // Uses the defined helper

                // Ensure the weekKey exists before pushing
                if (weekKey && reportByGrade[grade][section].weeklyDetails[weekKey]) {
                    reportByGrade[grade][section].weeklyDetails[weekKey].push({
                        sessionNo: session.sessionNumber,
                        topicName: session.sessionTitle,
                        date: sessionDate.toISOString().split('T')[0], // YYYY-MM-DD format
                        learningOutcome: session.learningOutcome,
                        trainerName: session.trainer ? session.trainer.name : 'N/A',
                        attachments: session.attachedFiles || [] // Ensure attachments are included
                    });
                }
            }
        });

        // --- Fetch Scheduled Sessions (Timetable) and identify not conducted sessions ---
        // Fetch all relevant timetable entries for the school, all grades, and all sections
        const allGradesInReport = Object.keys(reportByGrade).map(Number);
        const allSectionsInReport = [...new Set(Object.values(reportByGrade).flatMap(obj => Object.keys(obj)))];

        const scheduledTimetableEntries = await Timetable.find({
            school: school._id,
            grade: { $in: allGradesInReport },
            section: { $in: allSectionsInReport }
        });

        // Map conducted sessions for quick lookup using a more robust identifier
        const conductedSessionMap = new Set(
            conductedSessions.map(cs =>
                `${cs.grade}-${cs.sessionNumber}-${moment(cs.date).format('YYYY-MM-DD')}-${cs.section || 'N/A'}`
            )
        );

        // Iterate through each timetable entry and generate all possible scheduled dates for the month
        scheduledTimetableEntries.forEach(scheduledEntry => {
            const grade = scheduledEntry.grade.toString();
            const section = scheduledEntry.section || 'N/A';

            if (reportByGrade[grade] && reportByGrade[grade][section]) {
                const possibleScheduledDates = getDatesForDayOfWeekInMonth(
                    parseInt(year),
                    parseInt(month),
                    scheduledEntry.dayOfWeek // Assuming Timetable has 'dayOfWeek' field (e.g., 'Monday')
                );

                possibleScheduledDates.forEach(currentScheduledDate => {
                    // Check if this date falls within the report month range (getDatesForDayOfWeekInMonth should handle this, but good to double-check)
                    if (moment(currentScheduledDate).isBetween(startDate, endDate, 'day', '[]')) { // Inclusive check
                        reportByGrade[grade][section].scheduledSessions++;

                        const sessionIdentifier =
                            `${scheduledEntry.grade}-${scheduledEntry.sessionNumber}-${moment(currentScheduledDate).format('YYYY-MM-DD')}-${section}`;

                        if (!conductedSessionMap.has(sessionIdentifier)) {
                            reportByGrade[grade][section].notConductedSessions.push({
                                sessionNo: scheduledEntry.sessionNumber,
                                topicName: scheduledEntry.sessionTitle || 'Scheduled Topic', // From Timetable or placeholder
                                date: currentScheduledDate.toISOString().split('T')[0],
                                learningOutcome: scheduledEntry.learningOutcome || 'N/A'
                            });
                        }
                    }
                });
            }
        });

        // --- Calculate overall scheduled and conducted sessions till May 2025 ---
        // This part remains specific to a historical cut-off.
        // Make sure the start year for this cumulative calculation is correct for your data.
        const cumulativeStartDate = new Date(2024, 0, 1); // Assuming you want to start from Jan 1, 2024
        const may2025EndDate = new Date(2025, 4, 31, 23, 59, 59, 999); // May is month 4 (0-indexed)

        let totalScheduledSessionsTillMay2025 = 0;
        // Iterate through each month from cumulativeStartDate up to may2025EndDate
        for (
            let m = moment(cumulativeStartDate);
            m.isSameOrBefore(may2025EndDate, 'month');
            m.add(1, 'month')
        ) {
            const currentYear = m.year();
            const currentMonth = m.month() + 1; // 1-indexed month for helper functions

            scheduledTimetableEntries.forEach(scheduledEntry => {
                const possibleScheduledDatesInThisMonth = getDatesForDayOfWeekInMonth(
                    currentYear,
                    currentMonth,
                    scheduledEntry.dayOfWeek
                );
                // Filter dates to ensure they don't exceed the overall end date (may2025EndDate)
                totalScheduledSessionsTillMay2025 += possibleScheduledDatesInThisMonth.filter(d =>
                    moment(d).isBetween(cumulativeStartDate, may2025EndDate, 'day', '[]')
                ).length;
            });
        }

        const totalConductedSessionsTillMay2025 = await ClassDetails.countDocuments({
            school: school._id,
            date: { $gte: cumulativeStartDate, $lte: may2025EndDate }
        });


        // Final report formatting
        const finalReport = Object.values(reportByGrade).map(gradeSections => Object.values(gradeSections)).flat();

        res.json({
            schoolName: school.schoolName,
            reportMonth: `${new Date(startDate).toLocaleString('default', { month: 'long' })} ${year}`,
            totalStudents,
            totalBoys,
            totalGirls,
            gradesData: finalReport, // This will contain weeklyDetails
            summary: {
                month: `${new Date(startDate).toLocaleString('default', { month: 'long' })}`,
                year: parseInt(year),
                notConductedSessionsCount: finalReport.reduce((acc, curr) => acc + curr.notConductedSessions.length, 0),
                totalScheduledSessionsTillMay2025,
                totalConductedSessionsTillMay2025
            }
        });

    } catch (err) {
        console.error('Error generating school monthly report:', err);
        res.status(500).json({ msg: 'Server error generating report.' });
    }
};