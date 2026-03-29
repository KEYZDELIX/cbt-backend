const mongoose = require('mongoose');

const ExamConfigSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Exam Title
    durationMinutes: { type: Number, default: 60 },
    maxAttempts: { type: Number, default: 1 },
    // Changed from Boolean to String to match your <select> dropdown
    shuffleType: { 
        type: String, 
        enum: ['both', 'questions', 'none'], 
        default: 'both' 
    },
    // Changed from Boolean to String to match 'active'/'closed' dropdown
    status: { 
        type: String, 
        enum: ['active', 'closed'], 
        default: 'active' 
    },
    // Storing Registration Numbers (Strings) makes it easier to manage
    // than ObjectIDs if you are typing them in manually or from a CSV.
    assignedStudents: [String], 
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true }); // Automatically handles createdAt and updatedAt

module.exports = mongoose.model('ExamConfig', ExamConfigSchema);