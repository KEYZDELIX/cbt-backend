const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  // Link to the User
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },

  // Active Subject List (The 4 subjects they are writing)
  subjectCombination: [String], 

  // Track Every Response
  responses: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    subject: String,
    selectedOptionKey: { type: String, default: null }, // e.g., "A"
    isCorrect: { type: Boolean, default: false },
    pointsEarned: { type: Number, default: 0 } // Weight * (1 or 0)
  }],

  // Timing (Essential for CBT)
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date }, // Set this when the user clicks 'Submit'
  timeLeft: { type: Number }, // Store remaining seconds periodically

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Exam', ExamSchema);