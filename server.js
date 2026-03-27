// ================= BACKEND: server.js =================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Models
const Question = require('./models/Question');
const Result = require('./models/Result');
const User = require('./models/User');
const Exam = require('./models/Exam');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🔥 MongoDB connected'))	
  .catch(err => console.error('❌ Connection error:', err));

// --- ADMIN ROUTES ---

// 1. Register User via Admin
app.post('/admin/register-user', async (req, res) => {
    try {
        const { firstName, lastName, password, subjects } = req.body;
        
        // Auto-generate Reg Number with your preferred STT prefix
        const regNumber = `STT${Math.floor(100000 + Math.random() * 900000)}AB`;
        
        const newUser = new User({
            firstName,
            lastName,
            password,
            regNumber: regNumber.toUpperCase(),
            subjectCombination: ['Use of English', ...subjects]
        });

        await newUser.save();
        res.json({ success: true, regNumber: newUser.regNumber });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Add Question via Admin
app.post('/questions', async (req, res) => {
    try {
        const newQuestion = new Question(req.body);
        await newQuestion.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- EXAM & USER ROUTES ---

// 3. Login Route (Fixed "Undefined" Error)
app.post('/login', async (req, res) => {
  try {
    const { regNumber, password } = req.body;

    if (!regNumber || !password) {
      return res.status(400).json({ message: "Credentials required" });
    }

    const user = await User.findOne({ 
      regNumber: regNumber.toUpperCase(), 
      password: password 
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid Reg Number or Password" });
    }

    // Check for an existing active exam or create a new one
    let exam = await Exam.findOne({ userId: user._id, status: 'active' });
    
    if (!exam) {
      exam = new Exam({ 
        userId: user._id,
        subjectCombination: user.subjectCombination,
        status: 'active',
        startTime: new Date()
      });
      await exam.save();
    }

    // Sending full payload to prevent frontend "undefined"
    res.json({ 
      success: true,
      userId: user._id, 
      examId: exam._id, 
      firstName: user.firstName, 
      lastName: user.lastName,
      regNumber: user.regNumber, 
      subjects: user.subjectCombination 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Fetch Questions (Randomized by Subject)
app.get('/fetch-questions/:examId', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    let examPaper = [];

    for (let subject of exam.subjectCombination) {
      const limit = (subject === "Use of English") ? 60 : 40;
      
      const qs = await Question.aggregate([
        { $match: { subject: subject } },
        { $sample: { size: limit } },
        { $project: { correctOptionKey: 0 } } // Security: Hide answers
      ]);
      examPaper.push({ subject, questions: qs });
    }

    res.json(examPaper);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Save Answer (Live Persistence)
app.post('/save-answer', async (req, res) => {
  try {
    const { examId, questionId, selectedOptionKey } = req.body;

    const exam = await Exam.findById(examId);
    const question = await Question.findById(questionId);

    const isCorrect = question.correctOptionKey === selectedOptionKey;
    const points = isCorrect ? question.weight : 0;

    const existingIndex = exam.responses.findIndex(r => r.questionId.toString() === questionId);

    if (existingIndex > -1) {
      exam.responses[existingIndex].selectedOptionKey = selectedOptionKey;
      exam.responses[existingIndex].isCorrect = isCorrect;
      exam.responses[existingIndex].pointsEarned = points;
    } else {
      exam.responses.push({
        questionId,
        subject: question.subject,
        selectedOptionKey,
        isCorrect,
        pointsEarned: points
      });
    }

    await exam.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Submit Exam & Generate Final Result
app.post('/submit-exam', async (req, res) => {
  try {
    const { examId } = req.body;
    const exam = await Exam.findById(examId).populate('userId');
    
    if (exam.status === 'submitted') return res.status(400).json({ message: "Exam already submitted" });

    let subjectBreakdown = [];
    let grandTotal = 0;

    for (let subjectName of exam.subjectCombination) {
      const responses = exam.responses.filter(r => r.subject === subjectName);
      const correctCount = responses.filter(r => r.isCorrect).length;
      
      const rawScore = responses.reduce((acc, curr) => acc + curr.pointsEarned, 0);
      const totalPossibleWeight = (subjectName === "Use of English") ? 60 : 40; 
      
      // Scaling to 100
      const weightedScore = Math.min(100, (rawScore / totalPossibleWeight) * 100);
      
      subjectBreakdown.push({
        subjectName,
        correctCount,
        totalQuestions: totalPossibleWeight,
        weightedScore: Math.round(weightedScore)
      });

      grandTotal += weightedScore;
    }

    const finalResult = new Result({
      userId: exam.userId._id,
      examId: exam._id,
      subjectResults: subjectBreakdown,
      aggregateScore: Math.round(grandTotal)
    });

    await finalResult.save();
    
    exam.status = 'submitted';
    exam.endTime = new Date();
    await exam.save();

    res.json(finalResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Admin: View All Results
app.get('/all-results', async (req, res) => {
  try {
    const results = await Result.find()
      .populate('userId', 'firstName lastName regNumber')
      .sort({ examDate: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server Initialization
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});