const User = require('../models/User');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Session = require('../models/Session');
const Content = require('../models/Content'); // If you want to track content completion directly

exports.getStudentProgress = async (req, res) => {
    try {
        const studentId = req.user.id; // From auth middleware
        const student = await User.findById(studentId).select('grade'); // Assuming User model imported here

        if (!student) {
            return res.status(404).json({ msg: 'Student not found.' });
        }

        const studentGrade = student.grade;

        // 1. Calculate total available quizzes for the student's grade
        const totalQuizzes = await Quiz.countDocuments({ grade: studentGrade });

        // 2. Calculate completed quizzes for the student
        // Find distinct quiz IDs for which the student has completed an attempt
        const completedQuizzes = await QuizAttempt.distinct('quiz', {
            student: studentId,
            isCompleted: true // Or score > 0, depending on your definition of 'completed'
        });
        const numCompletedQuizzes = completedQuizzes.length;

        // 3. Calculate total available sessions for the student's grade
        // Find the sessions document for the student's grade
        const sessionDoc = await Session.findOne({ grade: studentGrade });
        const totalSessions = sessionDoc ? sessionDoc.sessions.length : 0;

        // 4. Calculate completed sessions
        // This is more complex and depends on your definition.
        // For simplicity, let's tie session completion to quiz completion for now,
        // or a student explicitly marking content as complete (which requires a new model/field).
        // Let's count a session as completed if ALL quizzes (if any) for that session are completed.
        // Or if the student has completed any content of that session.

        // A more robust approach for session completion would involve:
        // a) A 'StudentContentProgress' model to track completion of individual content items (ebooks, videos).
        // b) If a session has associated quizzes, the quizzes must be completed.
        // For this example, let's simplify and base 'session completion' on a basic indicator:
        // We'll count a session as completed if it contains no quizzes, OR if it has quizzes and
        // all quizzes for that specific session (and grade) are completed by the student.

        let numCompletedSessions = 0;
        if (totalSessions > 0 && sessionDoc) {
            for (const sessionItem of sessionDoc.sessions) {
                // Find quizzes specifically for this grade and session number
                const quizzesForSession = await Quiz.find({ grade: studentGrade, session: sessionItem.sessionNumber });

                if (quizzesForSession.length === 0) {
                    // If no quizzes for this session, consider it complete if there's any content
                    // For a real app, you'd track content completion per student here.
                    // For now, let's just assume if no quiz, session is "always" complete, or requires a manual mark
                    // For demo, let's assume if no quiz, it's auto-complete.
                    numCompletedSessions++;
                } else {
                    // If there are quizzes, check if all of them are completed by the student
                    const allSessionQuizzesCompleted = quizzesForSession.every(quiz =>
                        completedQuizzes.some(completedQuizId => completedQuizId.equals(quiz._id))
                    );
                    if (allSessionQuizzesCompleted) {
                        numCompletedSessions++;
                    }
                }
            }
        }

        // Calculate progress based on total available quizzes and sessions
        const totalPossibleUnits = totalQuizzes + totalSessions;
        const completedUnits = numCompletedQuizzes + numCompletedSessions;

        let progressPercentage = 0;
        if (totalPossibleUnits > 0) {
            progressPercentage = (completedUnits / totalPossibleUnits) * 100;
        }

        res.json({
            progress: progressPercentage,
            totalQuizzes,
            numCompletedQuizzes,
            totalSessions,
            numCompletedSessions
        });

    } catch (error) {
        console.error('Error fetching student progress:', error);
        res.status(500).json({ msg: 'Server error fetching student progress.' });
    }
};

// Make sure to import User model at the top of this file
// const User = require('../models/User');