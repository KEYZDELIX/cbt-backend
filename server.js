// ================= BACKEND: server.js =================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// 1. Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDY_NAME,
    api_key: process.env.CLOUDY_KEY,
    api_secret: process.env.CLOUDY_SECRET
});

console.log("Cloudinary Configured:", process.env.CLOUDY_NAME ? "YES" : "NO");


// 2. Set up the Storage Engine
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'quiz_images', // Folder name in Cloudinary
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 1000, crop: "limit" }] // Auto-resize for efficiency
    },
});
const upload = multer({ storage: storage });

// Models
const Question = require('./models/Question');
const Result = require('./models/Result');
const User = require('./models/User');
const Exam = require('./models/Exam');
const ExamConfig = require('./models/ExamConfig');
const bcrypt = require('bcryptjs'); // Highly recommended for password security

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🔥 MongoDB connected'))	
  .catch(err => console.error('❌ Connection error:', err));

// --- ADMIN ROUTES ---

app.post('/admin/register-user', async (req, res) => {
    try {
        const { 
            firstName, middleName, lastName, gender, 
            email, phone, courseOfStudy, classLevel, 
            password, subjects 
        } = req.body;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Auto-generate Reg Number
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const randomLetters = chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)];
        const regNumber = `SST26${Math.floor(1000 + Math.random() * 9000)}${randomLetters}`.toUpperCase();

        const newUser = new User({
            firstName, middleName, lastName, gender,
            email, phone, courseOfStudy, classLevel,
            password: hashedPassword,
            plainPassword: password,
            regNo: regNumber,
            subjectCombination: ['Use of English', ...subjects]
        });

        await newUser.save();
        
        // Return plain password ONLY here so the Success Modal can show it once
        res.json({ 
            success: true, 
            regNumber: newUser.regNo, 
            password: password 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.put('/admin/users/:id', async (req, res) => {
    try {
        const { password, subjects, ...otherData } = req.body;
        const updatePayload = { ...otherData };

        // 1. Only hash and update password if a new one was actually typed
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            updatePayload.password = await bcrypt.hash(password, salt);
        }

        // 2. Re-process subjects if they were changed
        if (subjects) {
            updatePayload.subjectCombination = ['Use of English', ...subjects];
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            { $set: updatePayload }, 
            { new: true }
        );

        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all users for the "View Registered Users" list
app.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch users" });
    }
});

// Delete a user
app.delete('/admin/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
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
// GET ALL QUESTIONS (For the Manage Table)
app.get('/questions', async (req, res) => {
    try {
        // We sort by -1 so the newest questions appear at the top
        const questions = await Question.find().sort({ updatedAt: -1 });
        res.json(questions);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch questions" });
    }
});


// DELETE QUESTION
app.delete('/questions/:id', async (req, res) => {
    try {
        await Question.findByIdAndDelete(req.params.id);
        res.json({ message: "Question deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete question" });
    }
});

// UPDATE EXISTING QUESTION
app.put('/questions/:id', async (req, res) => {
    try {
        const updatedQuestion = await Question.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true } // This returns the updated version
        );
        res.json({ success: true, data: updatedQuestion });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Cloudinary returns the secure URL in req.file.path
        console.log("File uploaded to Cloudinary:", req.file.path);
        res.json({ url: req.file.path });
    } catch (err) {
        console.error("Cloudinary Upload Error:", err);
        res.status(500).json({ error: 'Internal Server Error during upload' });
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

app.post('/start-exam', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findById(userId);
    
    const newExam = new Exam({
        userId: user._id,
        subjectCombination: user.subjectCombination,
        status: 'active',
        startTime: new Date()
    });
    
    await newExam.save();
    res.json({ examId: newExam._id });
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

// Example Express Route
app.get('/api/topics', async (req, res) => {
    try {
        const { subject } = req.query;
        // Find all questions for this subject and return unique topic names
        const topics = await Question.distinct('topic', { subject: subject });
        res.json(topics);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch topics" });
    }
});

//Merger
app.post('/api/topics/merge', async (req, res) => {
    const { subject, oldTopic, newTopic } = req.body;
    try {
        const result = await Question.updateMany(
            { subject: subject, topic: oldTopic },
            { $set: { topic: newTopic } }
        );
        res.json({ message: "Success", modifiedCount: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ error: "Merge failed" });
    }
});
app.get('/api/topics/stats', async (req, res) => {
    try {
        const { subject } = req.query;
        const stats = await Question.aggregate([
            { $match: { subject: subject } }, // Filter by subject (e.g., Physics)
            { $group: { _id: "$topic", count: { $sum: 1 } } }, // Group by topic name
            { $sort: { count: 1 } } // Sort from fewest to most questions
        ]);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});
// GET TOPIC INFO: Returns count for a specific topic or list for subject
app.get('/api/topics/info', async (req, res) => {
    try {
        const { subject, topic } = req.query;
        if (topic) {
            // If a topic is provided, just return the count for that one
            const count = await Question.countDocuments({ subject, topic });
            return res.json({ count });
        }
        // Otherwise, return the distinct list of topics for the subject
        const topics = await Question.distinct('topic', { subject });
        res.json(topics);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch topic data" });
    }
});

//--+-+ Manage Exam 

app.post('/api/exams/save', async (req, res) => {
    const { id, title, duration, shuffleType, attempts, status, assignedStudents } = req.body;
    
    try {
        const examData = {
            name: title,
            durationMinutes: duration,
            shuffleType: shuffleType,
            maxAttempts: attempts,
            status: status,
            assignedStudents: assignedStudents
        };

        if (id) {
            // UPDATE: Find by ID and replace data
            const updated = await ExamConfig.findByIdAndUpdate(id, examData, { new: true });
            res.json({ message: "Exam updated successfully!", data: updated });
        } else {
            // CREATE: New entry
            const newExam = new ExamConfig(examData);
            await newExam.save();
            res.json({ message: "Exam created successfully!", data: newExam });
        }
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Failed to save exam configuration." });
    }
});

// Server Initialization
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Run this ONCE to migrate old data to the new format
async function migrateOldExams() {
    await ExamConfig.updateMany(
        { status: { $exists: false } }, 
        { $set: { status: 'active', shuffleType: 'both' } }
    );
    console.log("Migration complete: Old exams updated to new status/shuffle format.");
}
// migrateOldExams(); // Uncomment this, run once, then delete it.
