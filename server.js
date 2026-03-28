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
const ExamConfig = require('./models/ExamConfig');

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
    const user = await User.findOne({ regNumber: regNumber.toUpperCase(), password });
    if (!user) return res.status(401).json({ message: "Invalid Credentials" });

    // Find active config or most recent config
    const config = await ExamConfig.findOne({ isActive: true }); 
    
    // Check attempts
    const attemptCount = await Exam.countDocuments({ userId: user._id, status: 'submitted' });
    const canTakeExam = config ? (attemptCount < config.maxAttempts) : true;

    res.json({
      success: true,
      user,
      config: config || { name: "General Mock", durationMinutes: 120 },
      attemptCount,
      canTakeExam
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/*app.post('/login', async (req, res) => {
  try {
    const { regNumber, password } = req.body;

    if (!regNumber || !password) {
      return res.status(400).json({ message: "Credentials required" });
    }

    const user = await User.findOne({ 
      regNumber: regNumber.toUpperCase(), 
      password: password 
    });

    // Inside app.post('/login'...)
let exam = await Exam.findOne({ userId: user._id, status: 'active' });

if (!exam) {
  // Ensure user.subjectCombination actually has data!
  if (!user.subjectCombination || user.subjectCombination.length === 0) {
      return res.status(400).json({ message: "No subjects assigned to this user. Contact Admin." });
  }

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
*/
// 4. Fetch Questions (Randomized by Subject)// --- UPDATED EXAM FETCHING WITH SHUFFLE ---
app.get('/fetch-questions/:examId', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId).populate('configId');
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    // Get the config settings
    const shuffleQs = exam.configId ? exam.configId.shuffleQuestions : true;
    const shuffleOpts = exam.configId ? exam.configId.shuffleOptions : true;

    let examPaper = [];
    for (let subject of exam.subjectCombination) {
      const limit = (subject === "Use of English") ? 60 : 40;
      
      let qs = await Question.aggregate([
        { $match: { subject: subject } },
        { $sample: { size: limit } },
        { $project: { correctOptionKey: 0 } } 
      ]);
    // Apply Shuffling
      if (shuffleOpts) {
        qs = qs.map(q => {
          q.options = q.options.sort(() => Math.random() - 0.5);
          return q;
        });
      }

      examPaper.push({ subject, questions: qs });
    }
    res.json(examPaper);
 } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/view-script/:resultId/:subject', async (req, res) => {
  try {
    const { resultId, subject } = req.params;
    const result = await Result.findById(resultId).populate('examId');
    if (!result) return res.status(404).json({ message: "Result not found" });

    // Get all questions for this subject
    const allQs = await Question.find({ subject: subject });
    
    // Map the student's responses to the questions
    const script = allQs.map(q => {
      const response = result.examId.responses.find(r => r.questionId.toString() === q._id.toString());
      return {
        questionText: q.questionText,
        options: q.options,
        correctKey: q.correctOptionKey,
        selectedKey: response ? response.selectedOptionKey : null,
        isCorrect: response ? response.isCorrect : false,
        explanation: q.explanation
      };
    });

    res.json({
      studentName: result.userId, // You might need to populate this in the query
      subject: subject,
      questions: script
    });
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