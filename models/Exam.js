const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  subjectCombination: [String], 
  
  // ADD THIS LINE BELOW
  status: { type: String, default: 'active' }, // 'active' or 'submitted'

  responses: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    subject: String,
    selectedOptionKey: { type: String, default: null },
    isCorrect: { type: Boolean, default: false },
    pointsEarned: { type: Number, default: 0 }
  }],
  attemptNumber: { type: Number, default: 1 },
configId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamConfig' },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  timeLeft: { type: Number },
  createdAt: { type: Date, default: Date.now },
  timestamp: { type: Date, default: Date.now }
});




module.exports = mongoose.model('Exam', ExamSchema);