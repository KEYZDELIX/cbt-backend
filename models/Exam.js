const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    // ==========================================
    // 1. TENANCY & SESSION IDENTITY
    // ==========================================
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization reference is required'],
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    examConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamConfig',
      required: true,
      index: true
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamSession',
      default: null,
      index: true
    },

    // ==========================================
    // 2. SESSION STATUS & PAPER TYPE
    // ==========================================
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
    // 3. QUESTION SERVING & NAVIGATION
    // ==========================================
    subjectCombination: [String],
    questionsServed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    lastActiveIndices: {
      type: Map,
      of: Number,
      default: {}
    },
    currentSubject: { type: String, trim: true },

    // ==========================================
    // 4. CANDIDATE RESPONSES & PROCTORING LOGS
    // ==========================================
    responses: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
        selectedOptionKey: { type: String, default: null }, // e.g., "A", "B" or string input
        isMarkedForReview: { type: Boolean, default: false },
        isCorrect: { type: Boolean, default: null },
        subject: String,
        secondsSpentOnQuestion: { type: Number, default: 0 },
        timestamp: { type: Date, default: Date.now }
      }
    ],

    // Anti-Cheat & Proctoring Engine
    tabSwitchCount: { type: Number, default: 0 },
    proctorLogs: [
      {
        eventType: {
          type: String,
          enum: ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'LOST_FOCUS', 'FORCE_SUBMIT'],
          required: true
        },
        timestamp: { type: Date, default: Date.now }
      }
    ],

    // ==========================================
    // 5. GRADING & SCORES
    // ==========================================
    subjectAnalysis: [
      {
        subjectName: String,
        secondsSpent: { type: Number, default: 0 },
        score: { type: Number, default: 0 }
      }
    ],
    totalScore: { type: Number, default: 0 },
    maxPossibleScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },

    // ==========================================
    // 6. TIMING & HARD EXPIRY
    // ==========================================
    totalSecondsRemaining: { type: Number },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    submittedAt: { type: Date, default: null },
    lockedQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],

    // ==========================================
    // 7. EXTERNAL / THEORY SUBMISSIONS
    // ==========================================
    theoryFileUrl: String
  },
  { timestamps: true }
);

examSchema.index({ userId: 1, examConfigId: 1, status: 1 });

module.exports = mongoose.model('Exam', examSchema);