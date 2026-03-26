const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  subject: String,
  topic: String,
  question: String,
  options: [String],
  answer: String,
  weight: { type: Number, default: 1 }
});

module.exports = mongoose.model('Question', QuestionSchema);
