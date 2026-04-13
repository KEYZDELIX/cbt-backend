// ================= BACKEND: server.js =================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const nodemailer = require('nodemailer');

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

// Initialize Transporter using Environment Variables
const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 587,
    secure: false, // Must be false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


// FORCE IPv4: Add this block right after your transporter definition
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); 

// Verification Check
transporter.verify((error, success) => {
    if (error) {
        console.log("❌ Email Connection Error:", error);
    } else {
        console.log("✅ Email Server is ready (Savvy Scholars)");
    }
});



// Models
const Question = require('./models/Question');
const Result = require('./models/Result');
const User = require('./models/User');
const Exam = require('./models/Exam');
const ExamConfig = require('./models/ExamConfig');
const bcrypt = require('bcryptjs'); // Highly recommended for password security
const { runNormalization } = require('./utils/scoring');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🔥 MongoDB connected'))	
  .catch(err => console.error('❌ Connection error:', err));
  
  // GET: Check if the mailer is alive
app.get('/api/test-email-connection', async (req, res) => {
    try {
        await transporter.verify();
        res.json({ 
            status: "Online", 
            message: "Connected to Savvy Scholars Gmail Engine",
            user: process.env.EMAIL_USER 
        });
    } catch (err) {
        res.status(500).json({ 
            status: "Offline", 
            error: err.message 
        });
    }
});

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
        res.json({ success: true, 
        regNumber: newUser.regNo, 
        password: password, // The plain text password from req.body
        user: newUser
          
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
            updatePayload.plainPassword = password;
        }
        
        const existingUser = await User.findById(req.params.id);
        if (!existingUser.regNo) {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            const randomLetters = chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)];
            updatePayload.regNo = `SST26${Math.floor(1000 + Math.random() * 9000)}${randomLetters}`.toUpperCase();
        }
        // 2. Re-process subjects if they were changed
        if (subjects) {
            updatePayload.subjectCombination = ['Use of English', ...subjects];
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            { $set: updatePayload }, 
            { returnDocument: 'after' }
        );

        res.json({ 
            success: true, 
            regNumber: updatedUser.regNo, 
            password: password || updatedUser.plainPassword,
            user: updatedUser 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all users for the "View Registered Users" list
app.get('/admin/users', async (req, res) => {
    try {
        const { search, level, gender, course } = req.query;
        let query = {};

        // 1. Search by Name or RegNo
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { regNo: { $regex: search, $options: 'i' } }
            ];
        }

        // 2. Filter by Level
        if (level) query.classLevel = level;

        // 3. Filter by Gender
        if (gender) query.gender = gender;

        // 4. Filter by Course
        if (course) query.courseOfStudy = { $regex: course, $options: 'i' };

        const users = await User.find(query).sort({ createdAt: -1 });
        const count = await User.countDocuments(query);

        res.json({ success: true, users, count });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        // Inside your save/update route// Inside your app.post('/questions') or app.put('/questions/:id')
const questionData = req.body;

if (questionData.subject === "Use of English" && questionData.subSubTopic && questionData.passage) {
    // This part ensures that "Passage 1" always stays identical across all questions
    await Question.updateMany(
        { subject: "Use of English", subSubTopic: questionData.subSubTopic },
        { $set: { passage: questionData.passage } }
    );
}

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





app.post('/api/auth/login', async (req, res) => {
    try {
        const { regNumber, password } = req.body;

        // Ensure we are querying the correct field: 'regNo' and 'plainPassword'
        const user = await User.findOne({ 
            regNo: regNumber.trim().toUpperCase(), 
            plainPassword: password.trim() 
        });

        if (!user) {
            return res.status(401).json({ message: "Invalid Registration Number or PIN" });
        }
        // Find active exam allocation (With 30-minute grace period)
const now = new Date();
const gracePeriod = 30 * 60 * 1000; // 30 minutes in milliseconds

const currentAllocation = user.examAllocations.find(alloc => {
    const start = new Date(alloc.startTime).getTime() - gracePeriod;
    const end = new Date(alloc.endTime).getTime() + gracePeriod;
    const currentTime = now.getTime();
    
    return currentTime >= start && currentTime <= end;
});

        // Check for an existing session to resume
        const existingSession = await Exam.findOne({ 
            userId: user._id, 
            status: 'active' 
        });

        // Send a clean object back to the frontend
        res.json({
            success: true,
            user: {
                _id: user._id,
                firstName: user.firstName,
                middleName: user.middleName || "",
                lastName: user.lastName,
                regNo: user.regNo,
                subjectCombination: user.subjectCombination
            },
            allocation: currentAllocation || null,
            resumeSessionId: existingSession ? existingSession._id : null
        });
        
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ message: "Internal Server Error: " + err.message });
    }
});


// 4. Fetch Questions (Randomized by Subject)// --- UPDATED EXAM FETCHING WITH SHUFFLE ---

async function getEnglishPaper(examConfigId) {
    const paper = [];
    const ExamConfig = require('./models/ExamConfig'); // Adjust path as needed
    const config = await ExamConfig.findById(examConfigId);

    if (!config || !config.englishDist || config.englishDist.length === 0) {
        console.error("No English distribution found in config!");
        return [];
    }

    // Loop through each rule set in the config (e.g., Section A -> Cloze -> 10 questions)
    for (const dist of config.englishDist) {
        try {
            // Check if this subtopic requires a passage (Comprehension/Cloze)
            const needsPassage = ["Comprehension Passage", "Cloze Passage"].includes(dist.subTopic);

            if (needsPassage) {
                // 1. Find all available 'subsubtopics' (which represent unique passages)
                const passages = await Question.distinct("subsubtopic", { 
                    subject: "Use of English",
                    subtopic: dist.subTopic 
                });

                if (passages.length > 0) {
                    // 2. Pick one random passage ID (subsubtopic)
                    const randomPassageId = passages[Math.floor(Math.random() * passages.length)];
                    
                    // 3. Fetch all questions linked to that specific passage
                    const passageQuestions = await Question.find({ 
                        subject: "Use of English",
                        subtopic: dist.subTopic,
                        subsubtopic: randomPassageId
                    }).sort({ _id: 1 }); // Keeps questions in order (Q1, Q2, Q3...)

                    // 4. Add to paper (up to the quantity specified in config)
                    paper.push(...passageQuestions.slice(0, dist.qty));
                }
            } else {
                // General Lexis, Structure, or Oral Forms (No Passage)
                const qs = await Question.aggregate([
                    { $match: { 
                        subject: "Use of English", 
                        subtopic: dist.subTopic // Matches "Antonyms", "Synonyms", etc.
                    }},
                    { $sample: { size: dist.qty } }
                ]);
                
                if (qs.length > 0) paper.push(...qs);
            }
        } catch (e) {
            console.error(`Error fetching ${dist.subTopic}:`, e);
        }
    }
    return paper;
}

app.get('/api/exams/fetch-questions/:examId', async (req, res) => {
    try {
        const { examId } = req.params;
        const session = await Exam.findById(examId).populate('userId');
        
        if (!session) return res.status(404).json({ error: "Exam session not found" });

        // IMPORTANT: We need the Config ID to know the English distribution
        // 'examId' in your Session model usually points to the ExamConfig ID
        const configId = session.examId; 

        let subjects = session.subjectCombination || session.userId.subjectCombination;

        const results = [];
        for (const sub of subjects) {
            let questions = [];
            if (sub === "Use of English") {
                // Pass the CONFIG ID here
                questions = await getEnglishPaper(configId);
            } else {
                // Fetch 40 questions for other subjects
                questions = await Question.aggregate([
                    { $match: { subject: sub } },
                    { $sample: { size: 40 } }
                ]);
            }

            results.push({
                subject: sub,
                questions: questions.map(q => ({
                    ...q,
                    // English questions shouldn't shuffle options if they are Comprehension/Oral?
                    // Usually safer to shuffle though.
                    options: q.options ? [...q.options].sort(() => 0.5 - Math.random()) : []
                }))
            });
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/exams/start-exam', async (req, res) => {
    try {
        const { userId, examId } = req.body;

        // 1. Check if examId was actually sent
        if (!examId) {
            return res.status(400).json({ error: "No Exam ID provided" });
        }

        let exam = await Exam.findOne({ userId, examId, status: 'active' });

        if (!exam) {
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ error: "User not found" });

            // 2. Check allocations with "Optional Chaining" (?.) to prevent crashes
            const allocation = user.examAllocations?.find(a => 
                a.examId?.toString() === examId.toString()
            );

            if (allocation && allocation.hasTaken) {
                return res.status(403).json({ 
                    error: "EXAM_ALREADY_TAKEN", 
                    message: "You have already submitted this exam attempt." 
                });
            }

            exam = new Exam({
                userId: user._id,
                examId: examId, 
                subjectCombination: user.subjectCombination, 
                status: 'active',
                startTime: new Date()
            });
            await exam.save();
        }

        res.json({ examId: exam._id });
    } catch (err) {
        console.error("Start Exam Error:", err);
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


// POST /api/exams/submit-exam

// POST: Submit Exam
app.post('/api/exams/submit-exam', async (req, res) => {
    try {
        const { userId, examId, responses, subjectAnalysis, totalSecondsRemaining, status } = req.body;

        const updatedExam = await Exam.findOneAndUpdate(
            { _id: examId, userId },
            { $set: { responses, subjectAnalysis, totalSecondsRemaining, status, 
              endTime: (status === 'submitted' || status === 'timed-out') ? new Date() : null } },
            { new: true }
        );

        // --- ERROR FIX: Added the missing IF block and defined userSubjects ---
        if (status === 'submitted' || status === 'timed-out') {
            const subjectResults = [];
            const userSubjects = updatedExam.subjectCombination || []; // Pull from DB

            for (const subName of userSubjects) {
                // 1. Determine expected total count
                const isEnglish = subName.toLowerCase().includes('english');
                const expectedTotal = isEnglish ? 60 : 40;

                // 2. Calculate the 'Perfect Score' denominator
                const dbQuestions = await Question.find({ subject: subName });
                const countInDb = dbQuestions.length;
                const weightInDb = dbQuestions.reduce((acc, q) => acc + (q.weight || 1), 0);

                let totalPossibleWeight;
                if (countInDb < expectedTotal) {
                    const missingCount = expectedTotal - countInDb;
                    totalPossibleWeight = weightInDb + (missingCount * 1.0);
                } else {
                    totalPossibleWeight = weightInDb;
                }

                // 3. Mark User Responses
                const subResponses = responses.filter(r => r.subject === subName);
                let correctCount = 0;
                let earnedWeight = 0;

                for (const resp of subResponses) {
                    const q = await Question.findById(resp.questionId);
                    if (q && q.correctOptionKey) {
                        const dbAns = q.correctOptionKey.trim().toUpperCase();
                        const userAns = resp.selectedOptionKey.trim().toUpperCase();

                        if (dbAns === userAns) {
                            correctCount++;
                            earnedWeight += (q.weight || 1);
                        }
                    }
                }

                // 4. Calculate final percentages
                const wScore1 = totalPossibleWeight > 0 ? (earnedWeight / totalPossibleWeight) * 100 : 0;
                const rScore1 = (correctCount / expectedTotal) * 100;

                subjectResults.push({
                    subjectName: subName,
                    correctCount,
                    totalQuestions: expectedTotal,
                    rawScore1: rScore1,
                    rawScore2: Math.round(rScore1),
                    weightedScore1: wScore1, 
                    weightedScore2: Math.round(wScore1),
                    normalizedScore1: 0, 
                    normalizedScore2: 0
                });
            } // End of for loop

            const totalRaw = subjectResults.reduce((acc, s) => acc + s.rawScore2, 0);
            const totalWeighted = subjectResults.reduce((acc, s) => acc + s.weightedScore2, 0);

            const finalResult = await Result.findOneAndUpdate(
                { userId, examId: updatedExam.examId }, 
                { userId, examId: updatedExam.examId, subjectResults, totalRawScore: totalRaw, totalWeightedScore: totalWeighted, timeTaken: 7200 - totalSecondsRemaining },
                { upsert: true, new: true }
            );

            await User.updateOne(
                { _id: userId, "examAllocations.examId": updatedExam.examId },
                { $set: { "examAllocations.$.hasTaken": true } }
            );

            await runNormalization(Result, updatedExam.examId);
            const refreshed = await Result.findById(finalResult._id);

            return res.json({ success: true, status: "finished", data: refreshed });
        } // End of status check block

        res.json({ success: true, status: "active" });
    } catch (err) {
        console.error("Submit Error:", err);
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

app.get('/api/subsubtopics', async (req, res) => {
    try {
        const { subject, name } = req.query;
        // Find if any question already uses this subSubTopic
        const existing = await Question.findOne({ subject, subSubTopic: name });
        
        if (existing) {
            res.json({ exists: true, passage: existing.passage });
        } else {
            res.json({ exists: false });
        }
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// 1. GET ALL UNIQUE SUB-SUBTOPICS (For the Datalist)
app.get('/api/topics/subsub', async (req, res) => {
    try {
        const { subTopic } = req.query;
        // Returns unique passage names like "Passage 1", "The Life Changer", etc.
        const subsubs = await Question.distinct('subSubTopic', { 
            subject: "Use of English", 
            subTopic: subTopic 
        });
        res.json(subsubs.filter(s => s)); // Filter out empty strings
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch sub-subtopics" });
    }
});

// 2. CHECK SPECIFIC SUB-SUBTOPIC (For Status & Auto-load Passage)
app.get('/api/subsub/check', async (req, res) => {
    try {
        const { name } = req.query;
        
        // Count all questions sharing this passage name
        const count = await Question.countDocuments({ 
            subject: "Use of English", 
            subSubTopic: name 
        });
        
        const existing = await Question.findOne({ 
            subject: "Use of English", 
            subSubTopic: name 
        });

        res.json({
            exists: count > 0,
            count: count,
            passage: existing ? existing.passage : ""
        });
    } catch (err) {
        res.status(500).json({ error: "Server check failed" });
    }
});



//--+-+ Manage Exam 
// SAVE OR UPDATE EXAM CONFIGURATION
app.post('/api/exams/save', async (req, res) => {
    const { 
        id, title, durationMinutes, maxAttempts, shuffleType, 
        totalQuestions, assignmentType, startDateTime, 
        endDateTime, batchSettings, englishDist, assignedStudents 
    } = req.body;

    const data = {
        title, durationMinutes, maxAttempts, shuffleType,
        totalQuestions, assignmentType, startDateTime,
        endDateTime, batchSettings, englishDist, assignedStudents
    };

    try {
        if (id) {
            await ExamConfig.findByIdAndUpdate(id, data);
            res.json({ message: "Exam Updated" });
        } else {
            const newEx = new ExamConfig(data);
            await newEx.save();
            res.json({ message: "Exam Created" });
        }
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Failed to save exam configuration: " + err.message });
    }
});
// GET ALL EXAMS (Sorted by most recent)
app.get('/api/exams', async (req, res) => {
    try {
        const exams = await ExamConfig.find().sort({ createdAt: -1 });
        res.json(exams);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch exams" });
    }
});
// DELETE EXAM
app.delete('/api/exams/:id', async (req, res) => {
    try {
        const deleted = await ExamConfig.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Exam already deleted or not found" });
        res.json({ message: "Exam deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Delete operation failed" });
    }
});
// RESET EXAM PROGRESS (Clears assigned student records if needed)
app.post('/api/exams/reset/:id', async (req, res) => {
    try {
        // This is where you would also clear a "Results" collection if you have one
        // For now, we just ensure the Exam config remains but is ready for a fresh start
        const exam = await ExamConfig.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: "Exam not found" });

        // Logic: You can either clear assignedStudents or just return a success
        // if you use a separate "UserExamSession" collection.
        res.json({ message: "Exam sessions have been reset for this configuration." });
    } catch (err) {
        res.status(500).json({ error: "Reset failed" });
    }
});

// SEARCH USERS (First, Middle, Last)
app.get('/api/students/search', async (req, res) => {
    try {
        const q = req.query.q;
        const users = await User.find({
            $or: [
                { firstName: { $regex: q, $options: 'i' } },
                { middleName: { $regex: q, $options: 'i' } },
                { lastName: { $regex: q, $options: 'i' } },
                { regNo: { $regex: q, $options: 'i' } }
            ]
        }).limit(10);

        // Format the names for the frontend dropdown
        const formattedUsers = users.map(u => ({
            regNo: u.regNo,
            fullName: `${u.firstName} ${u.middleName} ${u.lastName}`,
            classLevel: u.classLevel
        }));

        res.json(formattedUsers);
    } catch (err) {
        res.status(500).json([]);
    }
});

// GROUP USERS (Using classLevel)
app.get('/api/students/by-group', async (req, res) => {
    try {
        const selectedLevel = req.query.class; // This comes from your dropdown
        const users = await User.find({ classLevel: selectedLevel }).select('regNo');
        const regNumbers = users.map(u => u.regNo);
        res.json(regNumbers);
    } catch (err) {
        res.status(500).json([]);
    }
});



//Reset UserExamSession
app.post('/api/exams/reset/:id', async (req, res) => {
    const { type, regNumbers } = req.body;
    const examId = req.params.id;

    try {
        if (type === 'all') {
            // Delete all result records matching this exam ID
            await Result.deleteMany({ examId: examId });
        } else {
            // Delete only records for specific registration numbers
            await Result.deleteMany({ examId: examId, regNo: { $in: regNumbers } });
        }
        res.json({ message: "Reset complete" });
    } catch (err) {
        res.status(500).json({ error: "Reset failed" });
    }
});

// DISTRIBUTE batches
// POST: Randomly assign students to batches
app.post('/api/exams/distribute-batches/:id', async (req, res) => {
    try {
        const examId = req.params.id;
        const exam = await ExamConfig.findById(examId);
        if (!exam) return res.status(404).json({ error: "Exam not found" });

        const studentRegs = exam.assignedStudents;
        const batches = exam.batchSettings;

        if (!batches || batches.length === 0) {
            return res.status(400).json({ error: "No batches defined for this exam." });
        }

        // 1. Clear previous allocations for THIS specific exam to avoid duplicates
        await User.updateMany(
            { regNo: { $in: studentRegs } },
            { $pull: { examAllocations: { examId: exam._id } } }
        );

        // 2. Shuffle students (Fisher-Yates)
        const shuffled = [...studentRegs];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
// 3. Divide into batches
        const today = new Date().toISOString().split('T')[0]; // Gets "2026-04-06"
        const studentsPerBatch = Math.ceil(shuffled.length / batches.length);
        
        const updatePromises = shuffled.map((regNo, index) => {
            const batchIdx = Math.floor(index / studentsPerBatch);
            const b = batches[batchIdx];

            // Convert "21:04" string into a real Date object for today
            const fullStart = new Date(`${today}T${b.startTime}:00`);
            const fullEnd = new Date(`${today}T${b.endTime}:00`);

            return User.findOneAndUpdate(
                { regNo: regNo },
                { 
                    $push: { 
                        examAllocations: {
                            examId: exam._id,
                            title: exam.title,
                            batchNumber: b.batchNumber,
                            startTime: fullStart, // Now a Date object
                            endTime: fullEnd      // Now a Date object
                        } 
                    } 
                }
            );
        });

        await Promise.all(updatePromises);
        res.json({ message: "Distribution successful", count: shuffled.length, batches: batches.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EMAIL EXAM SCHEDULING

// Helper for Throttling
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// POST: Send Exam Slips via Email
app.post('/api/exams/notify-students/:id', async (req, res) => {
    try {
        const examId = req.params.id;
        const exam = await ExamConfig.findById(examId);
        
        // Find users who have an allocation for this exam
        const users = await User.find({ "examAllocations.examId": examId });

        if (users.length === 0) {
            return res.status(400).json({ error: "No students allocated. Run Shuffle first." });
        }

        // Respond immediately so Admin UI doesn't hang
        res.json({ message: `Dispatching emails to ${users.length} students...` });

        // Background loop
        for (const user of users) {
            const alloc = user.examAllocations.find(a => a.examId.toString() === examId);

            if (alloc && user.email) {
                try {
                    await transporter.sendMail({
                        from: '"THE MATH WORKSHOP" <themathworkshop@gmail.com>',
                        to: user.email,
                        subject: `Exam Schedule: ${exam.title}`,
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 500px; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                                <h2 style="color: #2563eb;">Exam Notification</h2>
                                <p>Hello <b>${user.firstName}</b>,</p>
                                <p>Your schedule for <b>${exam.title}</b> is ready:</p>
                                <div style="background: #f8fafc; padding: 15px; border-radius: 5px;">
                                    <b>Reg No:</b> ${user.regNo}<br>
                                    <b>Password:</b> <span style="color: #dc2626; font-weight: bold;">${user.password}</span><br>
                                    <hr style="border: 0; border-top: 1px solid #ddd; margin: 10px 0;">
                                    <b>Batch:</b> ${alloc.batchNumber}<br>
                                    <b>Start:</b> ${new Date(alloc.startTime).toLocaleString()}<br>
                                    <b>End:</b> ${new Date(alloc.endTime).toLocaleString()}
                                </div>
                                <p style="font-size: 0.8rem; color: #64748b; margin-top: 15px;">
                                    Login at the scheduled time. Your results will be available after the window closes.
                                </p>
                            </div>
                        `
                    });
                    console.log(`Sent to ${user.regNo}`);
                    await delay(3000); // 3 second pause
                } catch (e) {
                    console.error(`Mail failed for ${user.regNo}`);
                }
            }
        }
        // Update last notified timestamp
        await ExamConfig.findByIdAndUpdate(examId, { lastNotifiedAt: new Date() });
    } catch (err) {
        console.error("Critical Notify Error:", err);
    }
});

// Server Initialization
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

