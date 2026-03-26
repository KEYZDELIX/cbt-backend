const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  userId: String,
  answers: [
    {
      questionId: String,
      selected: String,
      correct: String,
      weight: Number
    }
  ],
  score: { type: Number, default: 0 },
  total: { type: Number, default: 400 },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Exam', ExamSchema);
