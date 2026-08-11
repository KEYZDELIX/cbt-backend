const mongoose = require('mongoose');

const examConfigSchema = new mongoose.Schema({
    // ==========================================
    // NEW: MULTI-TENANT & AUTHORSHIP LINKS
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
        default: 'PRIVATE' // 'PRIVATE' = Only this org's candidates can take it
    },

    // ==========================================
    // YOUR CORE EXAM CONFIGURATION (PRESERVED)
    // ==========================================
    examType: { type: String, required: true, default: 'JAMB' },
    paperType: { type: String, enum: ['OBJ', 'THEORY', 'PRACTICAL', 'GERMAN'], default: 'OBJ' },
    releaseMode: { type: String, enum: ['manual', 'instant'], default: 'instant' },
    subject: { 
        type: String, 
        default: 'General' // Default for JAMB or general mocks
    },
    title: { type: String, required: true, trim: true },

    // Timing Engine
    timingMode: { type: String, default: 'general' }, // 'general', 'perQuestion', 'perSet'
    setGroupSize: { type: Number, default: 5 }, // For "perSet" mode
    durationValue: { type: Number, default: 60 }, // Stores either total mins or seconds per question
    perQuestionSeconds: { type: Number, default: 60 },
    perSetSeconds: { type: Number, default: 300 },
    maxAttempts: { type: Number, default: 1 },

    // Randomization & Shuffling
    selectionMode: { type: String, enum: ['static', 'random'], default: 'static' },
    shuffleSeed: { type: String, default: null },
    shuffleType: { type: String, enum: ['none', 'questions', 'options', 'both', 'smart'], default: 'smart' },

    // Scheduling
    startDateTime: Date,
    endDateTime: Date,
    batchSettings: [{
        batchNumber: Number,
        startTime: String,
        endTime: String
    }],

    // Question Selection & Topic Distribution
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
        // Ensure "Auto-Pilot" stays relevant to recent years
        autoYearRange: { type: [String], default: ["2020", "2021", "2022", "2023", "2024", "2025", "2026"] }
    },

    // Candidate Assignments
    // Supports storing regNo strings or User ObjectIds seamlessly
    assignedStudents: [{ type: String, trim: true }],
    totalQuestions: Number,
    assignmentType: String, // e.g., 'ALL_STUDENTS', 'CLASS_LEVEL', 'CUSTOM_LIST'
    lastNotifiedAt: Date,

    // Status Flag
    status: {
        type: String,
        enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
        default: 'DRAFT',
        index: true
    }
}, { timestamps: true });

// ==========================================
// YOUR EXACT PRE-SAVE MIDDLEWARE
// ==========================================
examConfigSchema.pre('save', function(next) {
    // If the exam is anything other than Objective, force manual release
    if (this.paperType !== 'OBJ') {
        this.releaseMode = 'manual';
    } else {
        // Ensure OBJ stays instant unless manually overridden
        this.releaseMode = this.releaseMode || 'instant';
    }
    next();
});

// Compound Index for fast queries by organization and exam status
examConfigSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('ExamConfig', examConfigSchema);