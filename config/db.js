const mongoose = require('mongoose');
const seedSystem = require('../utils/seedSystem'); // Adjust path if seedSystem is elsewhere

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`🔥 MongoDB Connected: ${conn.connection.host}`);

    // Seed system user and host org if missing
    try {
      await seedSystem();
      console.log('✅ System seed check completed.');
    } catch (seedErr) {
      console.error('⚠️ Seed Error:', seedErr.message);
    }

  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1); // Stop process if DB connection fails
  }
};

module.exports = connectDB;