const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  
  subjectResults: [{
    subjectName: String,
    correctCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 40 },
    
    // Raw Scoring
    rawScore1: Number,      // (correct/total) * 100
    rawScore2: Number,      // round(rawScore1)
    
    // Weighted Scoring (Used for Normalization)
    weightedScore1: Number, // The x in your formula
    weightedScore2: Number, // round(weightedScore1)
    
    // JAMB Normalization
    normalizedScore1: Number, // [S1(x - x')/ S2] + x'1
    normalizedScore2: Number  // round(normalizedScore1)
  }],

  aggregateScore: { type: Number, default: 0 }, // Sum of normalizedScore2
  preciseRankingScore: { type: Number },        // Sum of normalizedScore1 (to 3 decimals)
  timeTaken: { type: Number }, 
  examDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', ResultSchema);