const express = require('express');

const router = express.Router();
const { login, loginAdmin, loginTrainer, loginPrincipal, logout, forgotPasswordRequest, verifyDobAndSendLink, resetPassword } = require('../controllers/authController');
const { getMe } = require('../controllers/userManagementController'); // Import getMe
const { auth } = require('../middleware/authMiddleware'); // Import auth middleware


router.post('/login', login); // Existing student login route
router.post('/admin/login', loginAdmin); // Dedicated admin login route
router.post('/trainer/login', loginTrainer); // Dedicated trainer login route
router.post('/principal/login', loginPrincipal);
router.post('/logout', logout);



// NEW: Forgot Password Routes

router.post('/forgot-password-request', forgotPasswordRequest); // Step 1: Email and user name check

router.post('/verify-dob-and-send-link', verifyDobAndSendLink); // Step 2: DOB verification and send email

router.put('/reset-password/:token', resetPassword); // Step 3: Reset password with token

router.get('/me', auth, getMe);



module.exports = router;