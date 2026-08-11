const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  // ==========================================
  // 1. TENANCY & SESSION IDENTITY
  // ==========================================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, "Organization reference is required"],
    index: true
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  examId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ExamConfig', 
    required: true,
    index: true 
  },
  allocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamAllocation',
    default: null,
    index: true
  },

  // ==========================================
  // 2. SESSION STATUS & PAPER TYPE
  // ==========================================
  // Added GERMAN to paperType across the engine
  paperType: { 
    type: String, 
    enum: ['OBJ', 'THEORY', 'PRACTICAL', 'GERMAN'], 
    default: 'OBJ' 
  },
  status: { 
    type: String, 
    enum: ['active', 'submitted', 'timed-out', 'pending_grading', 'disqualified'], 
    default: 'active',
    index: true 
  },
  
  // ==========================================
  // 3. QUESTION SERVING & SUBJECT NAVIGATION
  // ==========================================
  subjectCombination: [String], 
  questionsServed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  
  // Navigation Memory: Stores last viewed question index per subject
  // Example: { "Mathematics": 5, "English": 12, "German": 3 }
  lastActiveIndices: { 
    type: Map, 
    of: Number, 
    default: {} 
  },
  currentSubject: { type: String, trim: true },

  // ==========================================
  // 4. CANDIDATE RESPONSES & TIMINGS
  // ==========================================
  responses: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    selectedOptionKey: String, // e.g., "A", "B", "C", "D" or theory text string
    isCorrect: { type: Boolean, default: null },
    subject: String,
    secondsSpentOnQuestion: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
  }],

  subjectAnalysis: [{
    subjectName: String,
    secondsSpent: { type: Number, default: 0 },
    score: { type: Number, default: 0 }
  }],

  // Overall Score Summary (populated upon auto or manual grading)
  totalScore: { type: Number, default: 0 },
  maxPossibleScore: { type: Number, default: 0 },

  // ==========================================
  // 5. TIMING, LOCKING & HARD EXPIRY
  // ==========================================
  totalSecondsRemaining: { type: Number },
  startTime: { type: Date, default: Date.now },
  
  // Hard Expiry: Calculated at launch (startTime + durationValue + network buffer)
  endTime: { type: Date }, 
  
  // Prevents backtracking in perQuestion or perSet timing modes
  lockedQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],

  // ==========================================
  // 6. THEORY / PRACTICAL / GERMAN FILE SUBMISSION
  // ==========================================
  // Holds uploaded PDFs, audio recordings (German oral/listening), or scan sheets
  theoryFileUrl: String 

}, { timestamps: true });

// Compound Index for retrieving active sessions quickly during live exams
ExamSchema.index({ userId: 1, examId: 1, status: 1 });

module.exports = mongoose.model('Exam', ExamSchema);