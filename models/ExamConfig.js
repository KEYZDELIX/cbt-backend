const mongoose = require('mongoose');

const examConfigSchema = new mongoose.Schema({
  // ==========================================
  // MULTI-TENANT & AUTHORSHIP LINKS
  // ==========================================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, "Organization reference is required"],
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  visibility: {
    type: String,
    enum: ['PRIVATE', 'SHARED_WITH_PARTNERS', 'GLOBAL'],
    default: 'PRIVATE'
  },

  // ==========================================
  // MASTER TEMPLATE METADATA
  // ==========================================
  title: { 
    type: String, 
    required: [true, "Exam title is required"], 
    trim: true 
  },
  subject: { 
    type: String, 
    default: 'General' 
  },
  examType: { 
    type: String, 
    required: true, 
    default: 'JAMB' 
  },
  paperType: { 
    type: String, 
    enum: ['OBJ', 'THEORY', 'PRACTICAL', 'GERMAN'], 
    default: 'OBJ' 
  },
  releaseMode: { 
    type: String, 
    enum: ['manual', 'instant'], 
    default: 'instant' 
  },

  // ==========================================
  // TIMING ENGINE & RULES
  // ==========================================
  timingMode: { 
    type: String, 
    enum: ['general', 'perQuestion', 'perSet'],
    default: 'general' 
  },
  durationValue: { type: Number, default: 60 }, // Duration in minutes for 'general' or seconds per question/set
  perQuestionSeconds: { type: Number, default: 60 },
  perSetSeconds: { type: Number, default: 300 },
  setGroupSize: { type: Number, default: 5 },
  maxAttempts: { type: Number, default: 1 },

  // ==========================================
  // RANDOMIZATION & SHUFFLING
  // ==========================================
  selectionMode: { 
    type: String, 
    enum: ['static', 'random'], 
    default: 'static' 
  },
  shuffleSeed: { type: String, default: null },
  shuffleType: { 
    type: String, 
    enum: ['none', 'questions', 'options', 'both', 'smart'], 
    default: 'smart' 
  },

  // ==========================================
  // QUESTION COMPOSITION & ITEM BANK RULES
  // ==========================================
  totalQuestions: { type: Number, default: 0 },
  topicDistribution: [{ 
    subject: String,
    year: { type: String, default: "All" },
    topic: String,
    subTopic: String,
    subSubTopic: String,
    qty: { type: Number, default: 1 },
    sourceExamType: String,
    selectedIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    isCustomSelection: { type: Boolean, default: false }
  }],
  otherSubjectsDist: {
    qtyPerSubject: { type: Number, default: 40 },
    pickFromEveryTopic: { type: Boolean, default: true },
    autoYearRange: { 
      type: [String], 
      default: ["2020", "2021", "2022", "2023", "2024", "2025", "2026"] 
    }
  },

  // ==========================================
  // BLUEPRINT STATUS
  // ==========================================
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    default: 'DRAFT',
    index: true
  }
}, { timestamps: true });

// ==========================================
// PRE-SAVE MIDDLEWARE
// ==========================================
examConfigSchema.pre('save', function(next) {
  if (this.paperType !== 'OBJ') {
    this.releaseMode = 'manual';
  } else {
    this.releaseMode = this.releaseMode || 'instant';
  }
});

examConfigSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('ExamConfig', examConfigSchema);