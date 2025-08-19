const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http'); 
require('dotenv').config(); // Ensure dotenv is loaded first

// --- Import all your route files ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const trainerRoutes = require('./routes/trainerRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const progressRoutes = require('./routes/progressRoutes'); // <--- NEW: Import the progress routes
const classDetailsRoutes = require('./routes/classDetailsRoutes');
const doubtRoutes = require('./routes/doubtRoutes');
const principalRoutes = require('./routes/principalRoutes');
const assignedSessionRoutes = require('./routes/assignedSessionRoutes');
const holidayRoutes = require('./routes/holidayRoutes');

const app = express();

// --- Middleware Setup ---
app.use(cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:5175', 'http://localhost:5176','http://localhost:5174','http://localhost:5173','https://gklmsai.netlify.app','https://admingklmsai.netlify.app'], // Allow your frontend origin
    credentials: true // Allow cookies to be sent
}));



app.use(express.json()); // For parsing application/json bodies
app.use(cookieParser()); // For parsing cookies
app.use('/uploads', express.static('uploads')); // Serve static files from the 'uploads' directory

// --- Route Definitions ---
// Prefix your routes with /api for consistency
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/trainer', trainerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', progressRoutes); // <--- NEW: Add the progress routes.
                                // I've used '/api' as the base for /api/v1 from progressRoutes.js
                                // If your progressRoutes.js already has '/v1' prefix inside it,
                                // then this will resolve to /api/v1/progress etc.
                                // If progressRoutes.js uses '/' as base, this will be /api/progress, /api/reports/daily etc.
                                // The previous suggestion was /api/v1. Let's stick to /api/v1 if that's your general API versioning.
                                // So, assuming your `progressRoutes.js` uses `/progress` and `/reports` directly,
                                // using `app.use('/api/v1', progressRoutes);` here would make the full path `/api/v1/progress`, `/api/v1/reports/daily`, etc.
                                // Given your existing routes are like `/api/auth`, `/api/admin`, etc., let's use `/api` for consistency
                                // and let the `progressRoutes.js` define `/v1/progress` if you want versioning there.
                                // FOR NOW, I'm assuming `progressRoutes.js` defines top-level paths like `/progress` and `/reports/daily`
                                // and you want them under `/api/v1`. So, it's safer to use `/api/v1` here:
// Corrected integration based on previous routes suggestion:
// From `progressRoutes.js`:
// router.post('/progress', ...);
// router.get('/reports/daily', ...);
// router.get('/reports/monthly', ...);
// To make these accessible at /api/v1/progress, /api/v1/reports/daily, etc., the prefix should be /api/v1
app.use('/api/v1', progressRoutes); // <--- Correct way to integrate `progressRoutes`
app.use('/api/v1', classDetailsRoutes);
app.use('/api/v1/doubts', doubtRoutes); 
app.use('/api/principal', principalRoutes); 
app.use('/api/assigned-sessions', assignedSessionRoutes);
app.use('/api/holidays', holidayRoutes);
// --- Basic Route for Testing ---
app.get('/', (req, res) => {
    res.send('API is running...');
});

const server = http.createServer(app); // <--- 'app' is now defined

// --- Initialize Socket.IO ---
const { init: initSocketIo } = require('./utils/socket'); // Import initSocketIo here as it uses `server`
const io = initSocketIo(server); // <--- 'server' is now defined


// --- Server Port Configuration ---
const PORT = process.env.PORT || 5004;

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // Remove useCreateIndex and useFindAndModify if you are on Mongoose 6+ as they are default true
    // useCreateIndex: true, // Deprecated in Mongoose 6, default true
    // useFindAndModify: false // Deprecated in Mongoose 6, default true
})
   .then(() => {
    console.log('MongoDB connected');
    // This starts the CORRECT server that has Socket.IO attached to it
    server.listen(PORT, () => console.log(`Server started on port ${PORT}`)); 
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});