// authController.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Principal = require('../models/Principal');
 
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

const generateTokensAndSetCookies = (user, res) => {
    const accessToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRATION || '15m' }
    );


    const refreshToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRATION || '7d' }
    );

    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'None',
        maxAge: parseInt(process.env.ACCESS_TOKEN_COOKIE_MAXAGE || 900000)
    });

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'None',
        maxAge: parseInt(process.env.REFRESH_TOKEN_COOKIE_MAXAGE || 604800000)
    });

    return { accessToken, refreshToken };
};



exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        // --- ADD TRIM HERE ---
        const trimmedEmail = email ? email.trim() : '';
        const trimmedPassword = password ? password.trim() : '';
        // --- END ADDITION ---

        if (!trimmedEmail || !trimmedPassword) {
            return res.status(400).json({ msg: 'Please enter both email and password.' });
        }

        const user = await User.findOne({ email: trimmedEmail }); // Use trimmedEmail
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const isMatch = await bcrypt.compare(trimmedPassword, user.password); // Use trimmedPassword
        if (!isMatch) return res.status(401).json({ msg: 'Invalid credentials' });

        if (user.role !== 'student') {
            return res.status(403).json({ msg: 'Access denied. This login is for students only.' });
        }

        const { accessToken } = generateTokensAndSetCookies(user, res);

        res.json({
            msg: 'Logged in successfully',
            accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

exports.loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        // --- ADD TRIM HERE ---
        const trimmedEmail = email ? email.trim() : '';
        const trimmedPassword = password ? password.trim() : '';
        // --- END ADDITION ---

        if (!trimmedEmail || !trimmedPassword) {
            return res.status(400).json({ msg: 'Please enter both email and password.' });
        }

        const user = await User.findOne({ email: trimmedEmail }); // Use trimmedEmail
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const isMatch = await bcrypt.compare(trimmedPassword, user.password); // Use trimmedPassword
        if (!isMatch) return res.status(401).json({ msg: 'Invalid credentials' });

        if (user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. This login is for administrators only.' });
        }

        const { accessToken } = generateTokensAndSetCookies(user, res);

        res.json({
            msg: 'Logged in successfully',
            accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};
//start principal


exports.loginPrincipal = async (req, res) => {
    try {
        const { email, password } = req.body;
        const trimmedEmail = email ? email.trim() : '';
        const trimmedPassword = password ? password.trim() : '';

        if (!trimmedEmail || !trimmedPassword) {
            return res.status(400).json({ msg: 'Please enter both email and password.' });
        }

        // CRITICAL: Populate the school here too for the login response
        const principal = await Principal.findOne({ email: trimmedEmail }).populate('school');

        if (!principal) {
            return res.status(404).json({ msg: 'Principal not found' });
        }

        const isMatch = await principal.matchPassword(trimmedPassword);

        if (!isMatch) {
            return res.status(401).json({ msg: 'Invalid credentials' });
        }

        // Pass an object with _id and role to generateTokensAndSetCookies
        const { accessToken } = generateTokensAndSetCookies({
            _id: principal._id,
            role: 'principal' // Explicitly define role for JWT payload
        }, res);

        res.json({
            msg: 'Logged in successfully',
            accessToken,
            user: { // You can call it 'user' for frontend consistency
                id: principal._id,
                name: principal.name,
                email: principal.email,
                role: 'principal',
                // Include populated school data in the response
                school: principal.school ? { id: principal.school._id, name: principal.school.schoolName } : null
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

//end principal

exports.loginTrainer = async (req, res) => {
    try {
        const { email, password } = req.body;
        // --- ADD TRIM HERE ---
        const trimmedEmail = email ? email.trim() : '';
        const trimmedPassword = password ? password.trim() : '';
        // --- END ADDITION ---

        if (!trimmedEmail || !trimmedPassword) {
            return res.status(400).json({ msg: 'Please enter both email and password.' });
        }

        const user = await User.findOne({ email: trimmedEmail }); // Use trimmedEmail
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const isMatch = await bcrypt.compare(trimmedPassword, user.password); // Use trimmedPassword
        if (!isMatch) return res.status(401).json({ msg: 'Invalid credentials' });

        if (user.role !== 'trainer') {
            return res.status(403).json({ msg: 'Access denied. This login is for trainers only.' });
        }

        const { accessToken } = generateTokensAndSetCookies(user, res);

        res.json({
            msg: 'Logged in successfully',
            accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

exports.logout = (req, res) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(200).json({ msg: 'Logged out successfully' });
};

exports.refreshToken = async (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ msg: 'No refresh token provided.' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found for refresh token.' });
        }

        const { accessToken } = generateTokensAndSetCookies(user, res);

        res.json({
            msg: 'New access token generated',
            accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error('Refresh token error:', err);
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(403).json({ msg: 'Invalid or expired refresh token. Please log in again.' });
    }
};

exports.forgotPasswordRequest = async (req, res) => {
    try {
        const { email, role } = req.body;
        // --- ADD TRIM HERE ---
        const trimmedEmail = email ? email.trim() : '';
        // --- END ADDITION ---

        if (!trimmedEmail) {
            return res.status(400).json({ msg: 'Email is required.' });
        }
        if (role && role !== 'student') {
            return res.status(400).json({ msg: 'This forgot password request is for students only.' });
        }

        const user = await User.findOne({ email: trimmedEmail }); // Use trimmedEmail

        if (!user || user.role !== 'student') {
            return res.status(404).json({ msg: 'If an account with that email exists and is a student account, you will be prompted for further verification.' });
        }

        res.status(200).json({ msg: 'Email found. Please proceed with DOB verification.', userName: user.name });

    } catch (err) {
        console.error('Error in forgot password request:', err);
        res.status(500).json({ msg: 'Server error during password reset initiation.' });
    }
};

exports.verifyDobAndSendLink = async (req, res) => {
    try {
        const { email, dob, role } = req.body;
        // --- ADD TRIM HERE ---
        const trimmedEmail = email ? email.trim() : '';
        // --- END ADDITION ---

        if (!trimmedEmail || !dob) {
            return res.status(400).json({ msg: 'Email and Date of Birth are required.' });
        }
        if (role && role !== 'student') {
            return res.status(400).json({ msg: 'This forgot password request is for students only.' });
        }

        const user = await User.findOne({ email: trimmedEmail }); // Use trimmedEmail

        if (!user || user.role !== 'student') {
            return res.status(404).json({ msg: 'User not found or not a student account.' });
        }

        const requestDob = new Date(dob);
        const userDob = new Date(user.dob);

        if (requestDob.toISOString().slice(0, 10) !== userDob.toISOString().slice(0, 10)) {
            return res.status(401).json({ msg: 'Date of Birth does not match.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            {
                resetPasswordToken: hashedToken,
                resetPasswordExpire: Date.now() + 3600000
            },
            { new: true, runValidators: false }
        );

        if (!updatedUser) {
            return res.status(500).json({ msg: 'Failed to update user for password reset. User might have been deleted.' });
        }

        const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        const message = `
            You are receiving this because you (or someone else) has requested the reset of a password.
            Please click on the following link, or paste this into your browser to complete the process:
            \n\n${resetURL}\n\n
            This link is valid for 1 hour.
            If you did not request this, please ignore this email and your password will remain unchanged.
        `;

        try {
            await sendEmail({
                to: updatedUser.email,
                subject: 'GeniusKidz Password Reset Link',
                text: message,
                html: `<p>You are receiving this because you (or someone else) has requested the reset of a password for your GeniusKidz account.</p>
                        <p>Please click on the following link to reset your password:</p>
                        <p><a href="${resetURL}">Reset Your Password</a></p>
                        <p>This link is valid for 1 hour.</p>
                        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`
            });

            res.status(200).json({ msg: 'Password reset link sent to your email!' });

        } catch (emailError) {
            console.error('Error sending email:', emailError);
            await User.findByIdAndUpdate(user._id, {
                $unset: { resetPasswordToken: "", resetPasswordExpire: "" }
            });
            return res.status(500).json({ msg: 'Error sending password reset email. Please try again later.' });
        }

    } catch (err) {
        console.error('Error in DOB verification and sending link:', err);
        res.status(500).json({ msg: 'Server error during DOB verification.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;
        // --- ADD TRIM HERE ---
        const trimmedNewPassword = newPassword ? newPassword.trim() : '';
        // --- END ADDITION ---

        if (!trimmedNewPassword) {
            return res.status(400).json({ msg: 'New password is required.' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid or expired password reset token.' });
        }

        user.password = await bcrypt.hash(trimmedNewPassword, 10); // Use trimmedNewPassword
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.status(200).json({ msg: 'Password has been reset successfully.' });

    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ msg: 'Server error during password reset.' });
    }
};