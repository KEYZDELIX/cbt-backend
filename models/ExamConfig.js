const mongoose = require('mongoose');

const ExamConfigSchema = new mongoose.Schema({
    name: { type: String, required: true },
    assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    durationMinutes: { type: Number, default: 120 },
    maxAttempts: { type: Number, default: 1 },
    shuffleQuestions: { type: Boolean, default: true },
    shuffleOptions: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExamConfig', ExamConfigSchema);