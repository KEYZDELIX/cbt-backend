const mongoose = require('mongoose');
const ExamSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, default: 'active' },
  
  // ADD THIS LINE
  subjectCombination: [String], 

  responses: [{
    questionId: String,
    selectedOptionKey: String,
    subject: String,
    timestamp: { type: Date, default: Date.now }
  }],
  subjectAnalysis: [{
    subjectName: String,
    secondsSpent: { type: Number, default: 0 }
  }],
  totalSecondsRemaining: { type: Number },
  startTime: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Exam', ExamSchema);