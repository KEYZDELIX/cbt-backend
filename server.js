require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

// Database Connection Manager (Handles Atlas connection + seedSystem)
const connectDB = require('./config/db');

// External Service Configurations (Triggers auto-verification logs)
require('./config/mailer');
require('./config/cloudinary');

// Route Handlers
const authRoutes = require('./routes/authRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const examRoutes = require('./routes/examRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const supportRoutes = require('./routes/supportRoutes');
const proctorRoutes = require('./routes/proctorRoutes');

const app = express();

// 1. Core Security & Parsing Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED'
  });
});

// 3. API Route Registration
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/exam-configs', require('./routes/examConfigRoutes'));
app.use('/api/exams', examRoutes);
app.use('/api/exam-sessions', require('./routes/examSessionRoutes'));
app.use('/api/transactions', transactionRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/proctor', proctorRoutes);

// 4. 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// 5. Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.stack || err.message}`);
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 6. Start Database & Server Initialization
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 CBT Backend Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
};

startServer();

// 7. Unhandled Rejection & Graceful Shutdown
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed. Exiting server process.');
  process.exit(0);
});