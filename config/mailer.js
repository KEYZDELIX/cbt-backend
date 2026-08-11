const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL connection
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // 16-character Gmail App Password
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify email server connection on startup
transporter.verify((error) => {
  if (error) {
    console.log("❌ Email Connection Error:", error.message);
  } else {
    console.log("✅ Email Server is ready (Savvy Scholars Engine)");
  }
});

module.exports = transporter;