const mongoose = require('mongoose');

// ==========================================
// RECURSIVE SUB-QUESTION SCHEMA (UNTOUCHED)
// ==========================================
const SubQuestionSchema = new mongoose.Schema();
SubQuestionSchema.add({
  label: { type: String }, // e.g., "(a)", "(i)", "(I)", or "α"
  text: { type: String },
  image: { type: String, default: null },
  explanation: { type: String, default: "" },
  explanationImage: { type: String, default: null },
  weight: { type: Number, default: 1 },
  subQuestions: [SubQuestionSchema] // Recursive nesting for (a) -> (i) -> (I)
});

const QuestionSchema = new mongoose.Schema({
  // ==========================================
  // 1. TENANCY & ITEM BANK VISIBILITY (NEW)
  // ==========================================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, "Organization reference is required"],
    index: true
  },
  isGlobal: {
    type: Boolean,
    default: true, // true = Available to ALL organizations (e.g., WAEC/JAMB past questions)
    index: true
  },

  // ==========================================
  // 2. EXAM METADATA & CLASSIFICATION
  // ==========================================
  examType: { 
    type: String, 
    enum: ['JAMB', 'WAEC', 'NECO', 'CAMBRIDGE', 'JUPEB', 'IJMB', 'CUSTOM'], 
    default: 'JAMB', 
    index: true 
  },
  subject: { type: String, required: true, index: true },
  topic: { type: String, required: true, index: true },
  subTopic: { type: String, default: "" }, 
  subSubTopic: { type: String, default: "" }, 
  
  // Updated with GERMAN paper type to match ExamConfig and Exam schemas
  paperType: { 
    type: String, 
    enum: ['OBJ', 'THEORY', 'PRACTICAL', 'GERMAN'], 
    default: 'OBJ',
    index: true
  },
  
  instruction: { type: String, default: "" },
  passage: { type: String, default: "" }, // For Comprehension / German listening/reading passages
  
  // ==========================================
  // 3. CORE QUESTION CONTENT
  // ==========================================
  questionText: { type: String, required: true },
  questionImage: { type: String, default: null }, 
  
  // For OBJECTIVE (OBJ)
  options: [{
    key: { type: String, required: true }, // e.g., "A", "B", "C", "D"
    value: { type: String, default: "" },  
    optionImage: { type: String, default: null } 
  }],
  correctOptionKey: { type: String, default: "" }, // Not required for Theory/German

  // For THEORY / PRACTICAL / GERMAN (Recursive Structure preserved)
  subQuestions: [SubQuestionSchema], 
  
  weight: { type: Number, default: 1, min: 1 },
  explanation: { type: String, default: "" },
  explanationImage: { type: String, default: null },
  year: { type: Number, index: true }, 

  // ==========================================
  // 4. AUDIT & CREATOR TRACKING
  // ==========================================
  // Supports both ObjectIds and legacy String names like "SuperAdmin"
  // ==========================================
  // AUDIT & CREATOR TRACKING
  // ==========================================
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: [true, "Creator reference is required"],
    index: true
  },
  updatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  }
}, { timestamps: true });

// ==========================================
// INDEXES FOR FAST ITEM BANK SEARCHING
// ==========================================
QuestionSchema.index({ examType: 1, subject: 1, topic: 1 });
QuestionSchema.index({ organizationId: 1, isGlobal: 1 });

module.exports = mongoose.model('Question', QuestionSchema);