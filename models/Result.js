const mongoose = require('mongoose');

// Topic-level breakdown for candidate diagnostic reports
const TopicPerformanceSchema = new mongoose.Schema({
  topicName: { type: String, required: true },
  totalQuestions: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  scorePercentage: { type: Number, default: 0 }
}, { _id: false });

const SubjectResultSchema = new mongoose.Schema({
  subjectName: { type: String, required: true },
  
  // Question breakdown
  totalQuestions: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  attemptedCount: { type: Number, default: 0 },
  wrongCount: { type: Number, default: 0 },
  unattemptedCount: { type: Number, default: 0 },
  
  // Custom & Normalized Scoring (Preserved from original design)
  rawScore1: { type: Number, default: 0 },      
  rawScore2: { type: Number, default: 0 },      
  weightedScore1: { type: Number, default: 0 },  
  weightedScore2: { type: Number, default: 0 },  
  normalizedScore1: { type: Number, default: 0 }, 
  normalizedScore2: { type: Number, default: 0 },  
  
  percentageScore: { type: Number, default: 0 },
  grade: { type: String, default: "" }, // WAEC style: 'A1', 'B2', 'C4', etc.
  
  timeSpentSeconds: { type: Number, default: 0 },
  
  // Analytics for student revision reports
  topicBreakdown: [TopicPerformanceSchema]
}, { _id: false });

const ResultSchema = new mongoose.Schema({
  // ==========================================
  // 1. TENANCY & SESSION IDENTIFIERS
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
    required: [true, "User reference is required"], 
    index: true 
  },
  examId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ExamConfig', 
    index: true 
  }, 
  examSessionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Exam', 
    index: true,
    unique: true // Prevents duplicate result generation for a single session
  },

  // Unique verification code for official printable result slips
  verificationCode: {
    type: String,
    unique: true,
    index: true
  },

  // ==========================================
  // 2. EXAM CLASSIFICATION
  // ==========================================
  examType: { 
    type: String, 
    enum: ['JAMB', 'WAEC', 'NECO', 'CAMBRIDGE', 'JUPEB', 'IJMB', 'CUSTOM'],
    required: true,
    index: true 
  }, 
  paperType: { 
    type: String, 
    enum: ['OBJ', 'THEORY', 'PRACTICAL', 'GERMAN'],
    default: 'OBJ',
    index: true 
  }, 

  // ==========================================
  // 3. SUBJECT RESULTS & AGGREGATE METRICS
  // ==========================================
  subjectResults: [SubjectResultSchema],

  aggregateScore: { type: Number, default: 0, index: true }, // JAMB score out of 400 or total percentage
  maxPossibleScore: { type: Number, default: 400 },
  overallPercentage: { type: Number, default: 0 },
  preciseRankingScore: { type: Number, default: 0 }, // Decimal score for breaking leaderboard ties
  overallGrade: { type: String, default: "" }, // Overall pass standing (e.g. 'DISTINCTION', 'PASS')

  // ==========================================
  // 4. THEORY & MANUAL MARKING ENGINE
  // ==========================================
  theoryFileUrl: { type: String, default: null }, // URL to uploaded student handwritten answer PDF/images
  isGraded: { type: Boolean, default: true },      // Set false initially if paperType is THEORY or GERMAN
  gradingStatus: {
    type: String,
    enum: ['AUTO_GRADED', 'PENDING_GRADING', 'PARTIALLY_GRADED', 'FULLY_GRADED'],
    default: 'AUTO_GRADED',
    index: true
  },
  gradedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  gradedAt: { type: Date, default: null },
  examinerRemarks: { type: String, default: "" },

  // ==========================================
  // 5. TIMING & AUDIT METADATA
  // ==========================================
  timeTaken: { type: Number, default: 0 }, // In seconds
  examDate: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// ==========================================
// HIGH-PERFORMANCE REPORTING & LEADERBOARD INDEXES
// ==========================================
ResultSchema.index({ organizationId: 1, examType: 1, aggregateScore: -1 });
ResultSchema.index({ organizationId: 1, examId: 1, preciseRankingScore: -1 });
ResultSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Result', ResultSchema);