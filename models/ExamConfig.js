const mongoose = require('mongoose');

const examConfigSchema = new mongoose.Schema({
    title: { type: String, required: true },
    durationMinutes: Number,
    maxAttempts: { type: Number, default: 1 },
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