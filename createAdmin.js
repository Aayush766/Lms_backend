// createAdmin.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User'); // adjust path if needed

mongoose.connect('mongodb+srv://blazeaayush23:Aayush766@cluster0.ixykj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'); // Replace with your DB name

(async () => {
  const hashed = await bcrypt.hash('GeniusKidz123', 10); // You can change password
  await User.create({
    name: 'Super Admin',
    email: 'admin@geniusKidz.com',
    password: hashed,
    role: 'admin'
  });
  console.log('✅ Admin user created successfully');
  mongoose.disconnect();
})();
