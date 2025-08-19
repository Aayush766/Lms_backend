// controllers/quizController.js
const Quiz = require('../models/Quiz');
const User = require('../models/User'); // Required to check student's grade
const QuizAttempt = require('../models/QuizAttempt'); // Newly created model for tracking attempts

// Create a new Quiz (Admin)
exports.createQuiz = async (req, res) => {
    try {
        const { title, description, grade, session, questions, attemptsAllowed, timeLimit, difficulty, category, dueDate, instructions } = req.body;

        // Basic validation
        if (!title || !grade || !session || !questions || questions.length === 0) {
            return res.status(400).json({ msg: 'Title, grade, session, and at least one question are required.' });
        }

        // Validate each question structure
        for (const q of questions) {
            if (!q.questionText || !q.options || !Array.isArray(q.options) || q.options.length < 2 || !q.correctAnswer) {
                return res.status(400).json({ msg: 'Each question must have text, at least two options, and a correct answer.' });
            }
            if (!q.options.includes(q.correctAnswer)) {
                return res.status(400).json({ msg: `Correct answer "${q.correctAnswer}" for question "${q.questionText}" is not among the provided options.` });
            }
        }

        const newQuiz = new Quiz({
            title,
            description,
            grade: Number(grade),
            session: Number(session),
            questions,
            attemptsAllowed: attemptsAllowed || 1,
            timeLimit: timeLimit || 60, // Default to 60 minutes if not provided
            difficulty: difficulty || 'Medium',
            category: category || 'General',
            dueDate: dueDate ? new Date(dueDate) : undefined,
            instructions: instructions || 'Please read all questions carefully.',
            createdBy: req.user.id
        });

        await newQuiz.save();
        res.status(201).json({ msg: 'Quiz created successfully', quiz: newQuiz });

    } catch (err) {
        console.error('Error creating quiz:', err);
        res.status(500).json({ msg: 'Server error creating quiz', error: err.message });
    }
};

// Get all Quizzes (Admin)
exports.getAllQuizzes = async (req, res) => {
    try {
        const quizzes = await Quiz.find().populate('createdBy', 'name email');
        res.json(quizzes);
    } catch (err) {
        console.error('Error fetching all quizzes:', err);
        res.status(500).json({ msg: 'Server error fetching quizzes', error: err.message });
    }
};

// Get Quizzes by Session and Grade (Student/Admin for listing, without correct answers)
exports.getQuizzesBySessionAndGrade = async (req, res) => {
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

        const quizzes = await Quiz.find({
            session: parsedSession,
            grade: parsedGrade
        }).select('-__v -questions.correctAnswer'); // Exclude correct answers

        res.json(quizzes);
    } catch (err) {
        console.error('Error fetching quizzes by session and grade:', err);
        res.status(500).json({ msg: 'Server error fetching quizzes', error: err.message });
    }
};

// Get a single Quiz by ID (Admin, includes correct answers)
exports.getQuizById = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id).populate('createdBy', 'name email');
        if (!quiz) {
            return res.status(404).json({ msg: 'Quiz not found' });
        }
        res.json(quiz);
    } catch (err) {
        console.error('Error fetching quiz by ID:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz ID format' });
        }
        res.status(500).json({ msg: 'Server error fetching quiz', error: err.message });
    }
};

// Update a Quiz (Admin)
exports.updateQuiz = async (req, res) => {
    try {
        const { title, description, grade, session, questions, attemptsAllowed, timeLimit, difficulty, category, dueDate, instructions } = req.body;
        const quizId = req.params.id;

        if (!title || !grade || !session || !questions || questions.length === 0) {
            return res.status(400).json({ msg: 'Title, grade, session, and at least one question are required.' });
        }

        for (const q of questions) {
            if (!q.questionText || !q.options || !Array.isArray(q.options) || q.options.length < 2 || !q.correctAnswer) {
                return res.status(400).json({ msg: 'Each question must have text, at least two options, and a correct answer.' });
            }
            if (!q.options.includes(q.correctAnswer)) {
                return res.status(400).json({ msg: `Correct answer "${q.correctAnswer}" for question "${q.questionText}" is not among the provided options.` });
            }
        }

        const updatedQuiz = await Quiz.findByIdAndUpdate(
            quizId,
            {
                title, description,
                grade: Number(grade),
                session: Number(session),
                questions, attemptsAllowed, timeLimit, difficulty, category,
                dueDate: dueDate ? new Date(dueDate) : undefined,
                instructions
            },
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email');

        if (!updatedQuiz) {
            return res.status(404).json({ msg: 'Quiz not found' });
        }

        res.json({ msg: 'Quiz updated successfully', quiz: updatedQuiz });

    } catch (err) {
        console.error('Error updating quiz:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz ID format' });
        }
        res.status(500).json({ msg: 'Server error updating quiz', error: err.message });
    }
};

// Delete a Quiz (Admin)
exports.deleteQuiz = async (req, res) => {
    try {
        const quizId = req.params.id;
        const deletedQuiz = await Quiz.findByIdAndDelete(quizId);

        if (!deletedQuiz) {
            return res.status(404).json({ msg: 'Quiz not found' });
        }
        res.status(200).json({ msg: 'Quiz deleted successfully' });
    } catch (err) {
        console.error('Error deleting quiz:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz ID format' });
        }
        res.status(500).json({ msg: 'Server error deleting quiz', error: err.message });
    }
};

// --- NEW CRITICAL FUNCTION FOR STUDENT QUIZ OVERVIEW ---
exports.getQuizDetailsForStudent = async (req, res) => {
    try {
        const { quizId } = req.params;
        const studentId = req.user.id; // Assumed from auth middleware

        if (!quizId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid quiz ID format' });
        }

        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({ msg: 'Quiz not found' });
        }

        const student = await User.findById(studentId).select('grade'); // Get student's grade
        if (!student) {
            return res.status(404).json({ msg: 'Student profile not found.' });
        }

        // Optional: Validate if the quiz belongs to the student's grade
        if (student.grade !== quiz.grade) {
            console.warn(`Student ${studentId} (grade ${student.grade}) tried to access quiz ${quizId} (grade ${quiz.grade}). Access denied.`);
            return res.status(403).json({ msg: 'You are not authorized to view this quiz.' });
        }

        // --- DEADLINE LOGIC FOR DETAILS VIEW ---
        const now = new Date();
        const isPastDueDate = quiz.dueDate && now > quiz.dueDate; // This logic is fine for simple "past due date" check

        // Fetch user's attempts for this quiz using the QuizAttempt model
        const userAttemptsCount = await QuizAttempt.countDocuments({ student: studentId, quiz: quizId, isCompleted: true });

        // Determine if the student can attempt the quiz based on deadline and attempts allowed
        const canTakeQuiz = !isPastDueDate && (quiz.attemptsAllowed === 0 || userAttemptsCount < quiz.attemptsAllowed);


        // Build the response object, excluding correct answers
        const quizDetails = {
            _id: quiz._id,
            title: quiz.title,
            description: quiz.description,
            attemptsAllowed: quiz.attemptsAllowed,
            timeLimit: quiz.timeLimit,
            difficulty: quiz.difficulty,
            category: quiz.category,
            dueDate: quiz.dueDate,
            instructions: quiz.instructions,
            questionsCount: quiz.questions ? quiz.questions.length : 0,
            userAttempts: userAttemptsCount, // How many times this student has completed/submitted
            isPastDueDate: isPastDueDate, // Flag for frontend
            canTakeQuiz: canTakeQuiz // Flag for frontend to enable/disable 'Start Quiz'
        };

        res.json({ quiz: quizDetails }); // Send under 'quiz' key as expected by frontend

    } catch (err) {
        console.error('Error in getQuizDetailsForStudent:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz ID' });
        }
        res.status(500).send('Server Error');
    }
};

// --- NEW FUNCTION: Get a Quiz for Student to Take (includes questions, excludes correct answers) ---
exports.getQuizForStudentToTake = async (req, res) => {
    try {
        const { quizId } = req.params;
        const studentId = req.user.id; // From auth middleware

        // Validate quizId format
        if (!quizId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid quiz ID format' });
        }

        // Fetch the quiz, excluding the MongoDB __v field
        const quiz = await Quiz.findById(quizId).select('-__v');
        if (!quiz) {
            return res.status(404).json({ msg: 'Quiz not found' });
        }

        // Get student's grade for authorization
        const student = await User.findById(studentId).select('grade');
        if (!student) {
            return res.status(404).json({ msg: 'Student profile not found.' });
        }

        // Security check: Ensure the quiz belongs to the student's grade
        if (student.grade !== quiz.grade) {
            console.warn(`Security Alert: Student ${studentId} (grade ${student.grade}) tried to access quiz ${quizId} (grade ${quiz.grade}). Access denied.`);
            return res.status(403).json({ msg: 'You are not authorized to take this quiz.' });
        }

        // --- DEADLINE ENFORCEMENT BEFORE PROVIDING QUESTIONS ---
        const now = new Date();
        if (quiz.dueDate && now > quiz.dueDate) {
            return res.status(403).json({ msg: 'This quiz is past its due date and can no longer be attempted.' });
        }

        // --- ATTEMPTS ALLOWED ENFORCEMENT BEFORE PROVIDING QUESTIONS ---
        const userAttemptsCount = await QuizAttempt.countDocuments({ student: studentId, quiz: quizId, isCompleted: true });
        if (quiz.attemptsAllowed && userAttemptsCount >= quiz.attemptsAllowed) {
            return res.status(403).json({ msg: `You have already used all ${quiz.attemptsAllowed} allowed attempts for this quiz.` });
        }

        // Remove correct answers from questions before sending to student
        const questionsForStudent = quiz.questions.map(q => {
            // Convert Mongoose subdocument to plain object and then destructure
            const { correctAnswer, ...rest } = q.toObject();
            return rest;
        });

        // Construct the response object with necessary quiz details and the cleaned questions
        const quizDataForStudent = {
            _id: quiz._id,
            title: quiz.title,
            description: quiz.description,
            grade: quiz.grade,
            session: quiz.session,
            questions: questionsForStudent, // <--- This now includes the questions without answers
            attemptsAllowed: quiz.attemptsAllowed,
            timeLimit: quiz.timeLimit,
            difficulty: quiz.difficulty,
            category: quiz.category,
            dueDate: quiz.dueDate,
            instructions: quiz.instructions,
            userAttempts: userAttemptsCount // Pass current attempts to frontend
        };

        res.json({ quiz: quizDataForStudent });

    } catch (err) {
        console.error('Error in getQuizForStudentToTake:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz ID' });
        }
        res.status(500).send('Server Error fetching quiz for student.');
    }
};

// Submit Quiz (Student) - No changes needed here for deadline/results publishing as this is a submission endpoint
exports.submitQuiz = async (req, res) => {
    try {
        const { quizId, answers, startedAt, completedAt, timeTaken, timedOut } = req.body;
        const studentId = req.user.id; // Assumed from auth middleware

        // 1. Validate input
        if (!quizId || !answers || !Array.isArray(answers) || answers.length === 0 || !startedAt || !completedAt) {
            return res.status(400).json({ msg: 'Missing required submission data: quizId, answers (array), startedAt, completedAt.' });
        }

        // 2. Fetch the Quiz to validate answers and calculate score
        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({ msg: 'Quiz not found.' });
        }

        // 3. Determine the attemptNumber
        const previousAttemptsCount = await QuizAttempt.countDocuments({
            student: studentId,
            quiz: quizId,
            isCompleted: true
        });
        const attemptNumber = previousAttemptsCount + 1;

        // Optional: Check attempts allowed if you want to enforce it at submission
        // NOTE: This check is also in getQuizForStudentToTake for better UX.
        if (quiz.attemptsAllowed && attemptNumber > quiz.attemptsAllowed) {
            return res.status(403).json({ msg: `You have exceeded the allowed number of attempts for this quiz (${quiz.attemptsAllowed}).` });
        }

        // 4. Calculate score and prepare answers for saving
        let score = 0;
        const processedAnswers = [];

        quiz.questions.forEach(q => {
            const studentAnswerForQ = answers.find(a => a.questionId.toString() === q._id.toString());

            if (studentAnswerForQ) {
                processedAnswers.push({
                    questionId: q._id,
                    selectedOption: studentAnswerForQ.selectedOption
                });

                if (studentAnswerForQ.selectedOption === q.correctAnswer) {
                    score++;
                }
            } else {
                processedAnswers.push({
                    questionId: q._id,
                    selectedOption: null
                });
            }
        });

        // 5. Create a new QuizAttempt document
        const newAttempt = new QuizAttempt({
            student: studentId,
            quiz: quizId,
            attemptNumber: attemptNumber,
            answers: processedAnswers,
            score: score,
            totalQuestions: quiz.questions.length,
            startedAt: new Date(startedAt),
            completedAt: new Date(completedAt),
            timeTaken: timeTaken,
            timedOut: timedOut,
            isCompleted: true
        });

        await newAttempt.save();

        res.status(200).json({
            msg: 'Quiz submitted successfully!',
            result: {
                attemptId: newAttempt._id,
                score: score,
                totalQuestions: quiz.questions.length,
            }
        });

    } catch (err) {
        console.error('Error submitting quiz:', err);
        console.error('Validation Errors:', err.errors);
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: `Quiz submission failed: ${messages.join(', ')}` });
        }
        res.status(500).json({ msg: 'Server error submitting quiz', error: err.message });
    }
};


// Get a student's quiz attempts (Admin or Student's own history)
exports.getStudentQuizAttempts = async (req, res) => {
    try {
        const studentId = req.params.studentId || req.user.id; // Allow admin to specify, or student to view their own
        console.log('Fetching attempts for student ID:', studentId); // Debug: Check studentId

        const attempts = await QuizAttempt.find({ student: studentId })
            .populate('quiz', 'title') // Populate only the 'title' field from the Quiz model
            .sort({ completedAt: -1 }); // Latest attempts first

        console.log('Fetched raw attempts (before filtering):', attempts); // Debug: See raw attempts

        const formattedAttempts = attempts
            .filter(attempt => attempt.quiz !== null) // Filter out attempts with null quiz references if the quiz was deleted
            .map(attempt => ({
                _id: attempt._id,
                quizId: attempt.quiz._id,
                quizTitle: attempt.quiz.title,
                score: attempt.score,
                totalQuestions: attempt.totalQuestions,
                completedAt: attempt.completedAt,
            }));

        console.log('Formatted attempts (after filtering):', formattedAttempts); // Debug: See final data

        res.json(formattedAttempts);

    } catch (err) {
        console.error('Error fetching student quiz attempts:', err.message);
        if (!err.message.includes('Cannot read properties of null')) {
            console.error('Full Error Object:', err);
        }
        res.status(500).json({ msg: 'Server error fetching quiz attempts.' });
    }
};

// Get all attempts for a specific quiz (Admin)
exports.getQuizAttemptsForQuiz = async (req, res) => {
    try {
        const { quizId } = req.params;
        const attempts = await QuizAttempt.find({ quiz: quizId })
            .populate('student', 'name email grade') // Populate relevant student details
            .sort({ completedAt: -1 });

        res.json(attempts);
    } catch (err) {
        console.error('Error fetching quiz attempts for quiz:', err);
        res.status(500).json({ msg: 'Server error fetching quiz attempts for quiz', error: err.message });
    }
};

// --- NEW FUNCTION: Get Quiz Results for Student (includes correct answers for review) ---
exports.getQuizResultsForStudent = async (req, res) => {
    try {
        const { quizId, attemptId } = req.params;
        const studentId = req.user.id; // Assumed from auth middleware

        // Optional: Validate quizId and attemptId format
        if (!quizId.match(/^[0-9a-fA-F]{24}$/) || !attemptId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid ID format.' });
        }

        // Fetch the quiz with its questions and correct answers
        const quiz = await Quiz.findById(quizId).select('questions title dueDate'); // IMPORTANT: Fetch dueDate here
        if (!quiz) {
            return res.status(404).json({ msg: 'Quiz not found.' });
        }

        // Fetch the specific quiz attempt by the student
        const attempt = await QuizAttempt.findOne({ _id: attemptId, student: studentId, quiz: quizId });
        if (!attempt) {
            // It's crucial that the attempt belongs to the authenticated student and the correct quiz
            return res.status(404).json({ msg: 'Quiz attempt not found or not authorized.' });
        }

        // --- RESULT PUBLISHING LOGIC (SYNCHRONIZED WITH FRONTEND) ---
        const now = new Date(); // Current time on the server
        let resultsArePublished = false;

        if (quiz.dueDate) {
            const quizDueDateObj = new Date(quiz.dueDate); // Parse the due date from the quiz
            const nextDayAfterDueDateUTC = new Date(quizDueDateObj.getTime());
            nextDayAfterDueDateUTC.setUTCDate(nextDayAfterDueDateUTC.getUTCDate() + 1); // Move to the next day
            nextDayAfterDueDateUTC.setUTCHours(0, 0, 0, 0); // Set to midnight UTC of that next day

            // Compare current time's timestamp with the calculated "results available" timestamp
            // Use >= to include the exact moment of midnight on the next day
            if (now.getTime() >= nextDayAfterDueDateUTC.getTime()) {
                resultsArePublished = true;
            }
        } else {
            // If there's no due date, results are always published
            resultsArePublished = true;
        }
        // --- END OF RESULT PUBLISHING LOGIC ---

        let questionsWithResults = [];
        let message = '';

        if (!resultsArePublished) {
            // If results are NOT published yet, hide correct answers
            message = 'Detailed results (including correct answers) will be available after the quiz due date.';
            questionsWithResults = quiz.questions.map(q => {
                const studentAnswer = attempt.answers.find(a => a.questionId.toString() === q._id.toString());
                return {
                    _id: q._id,
                    questionText: q.questionText,
                    options: q.options,
                    correctAnswer: null, // Explicitly nullify correct answer if not published
                    selectedAnswer: studentAnswer ? studentAnswer.selectedOption : null
                };
            });
        } else {
            // If results ARE published, include correct answers for review
            questionsWithResults = quiz.questions.map(q => {
                const studentAnswer = attempt.answers.find(a => a.questionId.toString() === q._id.toString());
                return {
                    _id: q._id,
                    questionText: q.questionText,
                    options: q.options,
                    correctAnswer: q.correctAnswer, // Included for review
                    selectedAnswer: studentAnswer ? studentAnswer.selectedOption : null
                };
            });
        }

        // Send back all necessary data for the result page
        res.json({
            quizTitle: quiz.title,
            score: attempt.score,
            totalQuestions: attempt.totalQuestions,
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
            timeTaken: attempt.timeTaken,
            // Include quiz.dueDate in the response for the frontend's conditional rendering,
            // even if `resultsArePublished` handles the *decision* of whether to show correct answers.
            // The frontend needs `dueDate` for the "Results will be available on..." message.
            dueDate: quiz.dueDate,
            questionsWithResults: questionsWithResults, // Array with question details, student's answer, and conditionally correct answer
            message: message, // Informational message for the frontend
            resultsArePublished: resultsArePublished // Flag for frontend to conditionally display "correctAnswer"
        });

    } catch (err) {
        console.error('Error fetching quiz results for student:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz or Attempt ID' });
        }
        res.status(500).json({ msg: 'Server error fetching quiz results.', error: err.message });
    }
};

// Add this new function to exports in quizController.js
exports.getTrainerQuizReports = async (req, res) => {
    try {
        const { sessionId, section, quizId } = req.params; // 'section' here is used as 'grade' from the frontend route

        // Input validation
        if (!sessionId || !section || !quizId) {
            return res.status(400).json({ msg: 'Missing session ID, section (grade), or quiz ID.' });
        }

        if (!quizId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid Quiz ID format.' });
        }

        const parsedSession = parseInt(sessionId);
        const parsedGrade = parseInt(section); // Assuming 'section' in frontend maps to 'grade' in backend

        if (isNaN(parsedSession) || isNaN(parsedGrade)) {
            return res.status(400).json({ msg: 'Session and Grade must be valid numbers.' });
        }

        // First, verify the quiz exists and matches the session/grade
        const quiz = await Quiz.findById(quizId);
        if (!quiz) {
            return res.status(404).json({ msg: 'Quiz not found.' });
        }

        if (quiz.session !== parsedSession || quiz.grade !== parsedGrade) {
            return res.status(403).json({ msg: 'Quiz does not match the provided session or grade.' });
        }

        let query = { quiz: quizId };

        // If the user is a principal, filter by their school
        if (req.user.role === 'principal' && req.user.school) {
            // Need to get all students from the principal's school and then filter attempts by those students
            const principalSchoolName = req.user.school;
            const studentsInPrincipalSchool = await User.find({ school: principalSchoolName }).select('_id');
            const studentIdsInPrincipalSchool = studentsInPrincipalSchool.map(s => s._id);

            // Add student filter to the query
            query.student = { $in: studentIdsInPrincipalSchool };
        }

        // Fetch all attempts for this specific quiz, populated with student details
        const attempts = await QuizAttempt.find(query)
            .populate('student', 'name school') // Populate student name AND school
            .sort({ student: 1, completedAt: -1 }); // Sort by student, then by latest attempt

        const studentReportsMap = new Map();

        // Process attempts to get the latest completed attempt for each student
        attempts.forEach(attempt => {
            // Ensure student is populated and attempt is completed
            // And for principals, ensure the student belongs to their school (already filtered by query, but good to be explicit for clarity)
            if (attempt.student && attempt.isCompleted && (req.user.role !== 'principal' || (attempt.student.school === req.user.school))) {
                const studentId = attempt.student._id.toString();
                // If we haven't seen this student before, or this attempt is newer than the one stored
                // (since we sorted by completedAt descending, the first one encountered for a student will be the latest)
                if (!studentReportsMap.has(studentId)) {
                    studentReportsMap.set(studentId, {
                        studentId: studentId,
                        studentName: attempt.student.name,
                        quizMarks: attempt.score,
                        totalQuestions: attempt.totalQuestions,
                        lastAttemptId: attempt._id, // Store the ID of the last attempt for detailed view
                        quizId: quizId, // Add quizId for the frontend navigation
                        completedAt: attempt.completedAt
                    });
                }
            }
        });

        // Convert map values to an array to send as response
        const studentQuizReports = Array.from(studentReportsMap.values());

        res.json(studentQuizReports);

    } catch (err) {
        console.error('Error fetching trainer quiz reports:', err);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz ID format' });
        }
        res.status(500).json({ msg: 'Server error fetching trainer quiz reports.', error: err.message });
    }
};

exports.getQuizzesForTrainerByGradeAndSession = async (req, res) => {
    try {
        const { gradeId, sessionId } = req.params; // Extract from path parameters

        if (!sessionId || !gradeId) {
            return res.status(400).json({ msg: 'Grade ID and Session ID are required.' });
        }

        const parsedSession = parseInt(sessionId);
        const parsedGrade = parseInt(gradeId);

        if (isNaN(parsedSession) || isNaN(parsedGrade)) {
            return res.status(400).json({ msg: 'Session ID and Grade ID must be valid numbers.' });
        }

        // Fetch quizzes for the specified grade and session
        // You might want to select specific fields for trainers,
        // or just exclude sensitive ones like correct answers for a general list.
        const quizzes = await Quiz.find({
            session: parsedSession,
            grade: parsedGrade
        }).select('-__v -questions.correctAnswer'); // Exclude correct answers for general listing

        res.json(quizzes);
    } catch (err) {
        console.error('Error fetching quizzes for trainer by grade and session:', err);
        res.status(500).json({ msg: 'Server error fetching quizzes for trainer', error: err.message });
    }
};

// NEW FUNCTION: Get Detailed Quiz Results for Trainer (includes correct answers for review)
exports.getDetailedStudentQuizResultForTrainer = async (req, res) => {
    try {
        const { quizId, attemptId } = req.params;
        const trainerId = req.user.id; // From auth middleware

        // Optional: Verify the trainer has permission to view results for this quiz/student
        // (e.g., is assigned to the student's grade/session). This is handled by canPrincipalViewStudentReport middleware

        // Validate quizId and attemptId format
        if (!quizId.match(/^[0-9a-fA-F]{24}$/) || !attemptId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ msg: 'Invalid ID format.' });
        }

        const quizAttempt = await QuizAttempt.findById(attemptId) // Find the specific quiz attempt
            .populate({
                path: 'quiz',
                // *** IMPORTANT FIX: Ensure questions._id is included in the select statement for subdocuments ***
                select: 'title dueDate questions._id questions.questionText questions.options questions.correctAnswer'
            })
            .populate('student', 'name'); // Populate student name

        // Ensure quizAttempt, quizAttempt.quiz, and quizAttempt.student are all valid
        if (!quizAttempt || !quizAttempt.quiz || quizAttempt.quiz._id.toString() !== quizId || !quizAttempt.student) {
            return res.status(404).json({ msg: 'Quiz attempt, associated quiz, or student not found, or quiz ID mismatch.' });
        }

        // Prepare the detailed results, including correct answers (since this is for a trainer)
        const questionsWithResults = quizAttempt.quiz.questions.map(q => {
            const studentAnswer = quizAttempt.answers.find(ans => ans.questionId.toString() === q._id.toString());
            return {
                _id: q._id,
                questionText: q.questionText,
                options: q.options,
                selectedAnswer: studentAnswer ? studentAnswer.selectedOption : 'No answer selected',
                correctAnswer: q.correctAnswer // Include correct answer for trainer's review
            };
        });

        res.json({
            quizTitle: quizAttempt.quiz.title,
            studentName: quizAttempt.student.name,
            score: quizAttempt.score,
            totalQuestions: quizAttempt.totalQuestions,
            startedAt: quizAttempt.startedAt,
            completedAt: quizAttempt.completedAt,
            dueDate: quizAttempt.quiz.dueDate, // Include dueDate
            questionsWithResults: questionsWithResults, // Array with question details, student's answer, and correct answer
        });

    } catch (error) {
        console.error('Error fetching detailed student quiz result for trainer:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Quiz ID or Attempt ID' });
        }
        res.status(500).json({ msg: 'Server error fetching detailed quiz result.' });
    }
};