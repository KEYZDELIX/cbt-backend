const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamConfig', index: true },
  status: { 
      type: String, 
      enum: ['active', 'submitted', 'timed-out'], 
      default: 'active' 
  },
  
  subjectCombination: [String], 
  // Store the full Question Objects or just IDs? 
  // IDs are better for performance.
  questionsServed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  
  responses: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    selectedOptionKey: String, // 'A', 'B', 'C', 'D'
    isCorrect: Boolean,
    subject: String,
    timestamp: { type: Date, default: Date.now }
  }],

  subjectAnalysis: [{
    subjectName: String,
    secondsSpent: { type: Number, default: 0 },
    score: { type: Number, default: 0 } // Added to store raw score per subject
  }],

  totalSecondsRemaining: { type: Number },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date }
}, { timestamps: true }); // Tracks when the record was created/updated

module.exports = mongoose.model('Exam', ExamSchema);