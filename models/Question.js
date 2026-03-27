const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  subject: { type: String, required: true, index: true },
  topic: { type: String, required: true },
  
  // Main Question Content
  questionText: { type: String, required: true },
  questionImage: { type: String, default: null }, // Diagram for the question stem
  
  // Flexible Options
  options: [{
    key: { type: String, required: true }, // "A", "B", "C", "D"
    value: { type: String, default: "" },  // Textual answer
    optionImage: { type: String, default: null } // Image answer (e.g., a chemical structure)
  }],
  
  correctOptionKey: { type: String, required: true },
  
  // Logic & Scoring
  weight: { 
    type: Number, 
    default: 1, 
    min: 0.5, 
    max: 2.0 
  },
  explanation: { type: String },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Question', QuestionSchema);