const mongoose = require('mongoose');

const examConfigSchema = new mongoose.Schema({
    // Add to your Schema:
    examType: { type: String, required: true, default: 'JAMB' },
    title: { type: String, required: true },
    // Add these to your Schema
    timingMode: { type: String, default: 'general' }, // 'general', 'perQuestion', 'perSet'
    setGroupSize: { type: Number, default: 5 }, // For "perSet" mode
    durationValue: { type: Number, default: 60 }, // Stores either total mins or seconds per question
    maxAttempts: { type: Number, default: 1 },
    selectionMode: { type: String, enum: ['static', 'random'], default: 'static' },
    shuffleSeed: { type: String, default: null },
    shuffleType: { type: String, default: 'smart' },
    startDateTime: Date,
    endDateTime: Date,
    batchSettings: [{
        batchNumber: Number,
        startTime: String,
        endTime: String
    }],
    englishDist: [{ 
        section: String, 
        topic: String,
        subTopic: String, 
        qty: Number 
    }],
    otherSubjectsDist: {
        qtyPerSubject: { type: Number, default: 40 },
        pickFromEveryTopic: { type: Boolean, default: true }
    },
    assignedStudents: [String],
    totalQuestions: Number,
    assignmentType: String,
    lastNotifiedAt: Date
}, { timestamps: true }); // This automatically adds createdAt and updatedAt

module.exports = mongoose.model('ExamConfig', examConfigSchema);