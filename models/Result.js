const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamConfig' }, 
    examSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    
    // Define the internal fields here
    subjectResults: [{
        subjectName: String,
        correctCount: Number,
        totalQuestions: Number,
        rawScore1: Number,      // Decimal Raw
        rawScore2: Number,      // Rounded Raw
        weightedScore1: Number,  // Decimal Weighted
        weightedScore2: Number,  // Rounded Weighted
        normalizedScore1: Number, // Decimal Curved
        normalizedScore2: Number  // Rounded Curved
    }],

    aggregateScore: Number,       // Sum of normalizedScore2
    preciseRankingScore: Number,  // Sum of normalizedScore1 (for tie-breaking)
    totalWeightedScore: Number,   // Keep for backward compatibility
    timeTaken: Number,
    examDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', ResultSchema);