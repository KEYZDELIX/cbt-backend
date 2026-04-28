const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  examType: { 
    type: String, 
    enum: ['JAMB', 'WAEC'], 
    default: 'JAMB', 
    index: true 
  },
  
  subject: { type: String, required: true, index: true },
  topic: { type: String, required: true, index: true },

  paperType: { 
    type: String, 
    enum: ['OBJ', 'THEORY', 'PRACTICAL'], 
    default: 'OBJ' 
  },

  // --- NEW OPTIONAL INSTRUCTION FIELD ---
  // Use this for: "Choose the most appropriate option..." or "Use the diagram to..."
  instruction: { type: String, default: "" },

  subTopic: { type: String, default: "" }, 
  subSubTopic: { type: String, default: "" }, 
  passage: { type: String, default: "" },
  
  questionText: { type: String, required: true },
  questionImage: { type: String, default: null }, 
  
  options: [{
    key: { type: String, required: true }, 
    value: { type: String, default: "" },  
    optionImage: { type: String, default: null } 
  }],
  
  correctOptionKey: { type: String, required: true },
  
  weight: { type: Number, default: 1, min: 1, max: 3.0 },
  explanation: { type: String },
  year: { type: Number, index: true }, 
  createdBy: { type: String, default: "SuperAdmin" }, // Name or ID of Admin
  updatedBy: { type: String, default: null },
},{ timestamps: true });

QuestionSchema.index({ examType: 1, subject: 1 });

module.exports = mongoose.model('Question', QuestionSchema);