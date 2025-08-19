let io;

module.exports = {
    init: httpServer => {
        io = require('socket.io')(httpServer, {
            cors: {
                origin: process.env.FRONTEND_URL || '*', // fallback if env is not set
                methods: ['GET', 'POST'],
                credentials: true
            }
        });

        io.on('connection', socket => {
            console.log('✅ New client connected:', socket.id);

            // Join user's personal room (notifications)
            socket.on('joinUserRoom', userId => {
                socket.join(userId);
                console.log(`🔔 User ${userId} joined personal room.`);
            });

            // Join doubt session room
            socket.on('joinDoubtSession', doubtSessionId => {
                socket.join(doubtSessionId);
                console.log(`💬 Socket ${socket.id} joined doubt session: ${doubtSessionId}`);
            });

            // Handle sending messages
            socket.on('sendMessage', message => {
                if (message.doubtSession) {
                    io.to(message.doubtSession).emit('newMessage', message);
                    console.log(`📨 Message broadcasted in ${message.doubtSession}`);
                } else {
                    console.warn('⚠️ sendMessage called without doubtSession ID:', message);
                }
            });

            // Leave doubt session room
            socket.on('leaveDoubtSession', doubtSessionId => {
                socket.leave(doubtSessionId);
                console.log(`🚪 Socket ${socket.id} left doubt session: ${doubtSessionId}`);
            });

            // Disconnect
            socket.on('disconnect', () => {
                console.log('❌ Client disconnected:', socket.id);
            });
        });

        return io;
    },

    getIo: () => {
        if (!io) throw new Error('❗Socket.IO not initialized!');
        return io;
    }
};
