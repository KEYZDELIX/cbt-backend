const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema({
  // Link to the User and the specific Exam session
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  examId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Exam' 
  },

  // Breakdown per Subject
  subjectResults: [{
    subjectName: String, // e.g., "Use of English"
    correctCount: { type: Number, default: 0 }, // e.g., 45
    totalQuestions: { type: Number, default: 40 }, // 60 for English, 40 others
    weightedScore: { type: Number, default: 0 }  // Scaled to 100
  }],

  // Grand Totals
  aggregateScore: { 
    type: Number, 
    default: 0, 
    max: 400 
  },
  
  // Performance Metadata
  timeTaken: { type: Number }, // In seconds, for analytics
  examDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', ResultSchema);