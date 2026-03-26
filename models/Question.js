const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  subject: String,
  question: String,
  options: [String],
  answer: String
});

module.exports = mongoose.model('Question', QuestionSchema);
