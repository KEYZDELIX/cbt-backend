// ================= BACKEND: server.js =================
require('dotenv').config();
const express = require('express');
const router = express.Router();
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
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // The 16-character App Password
    },
    tls: {
        rejectUnauthorized: false // Helps prevent connection drops on some servers
    }
});


// FORCE IPv4: Add this block right after your transporter definition
//const dns = require('dns');
//dns.setDefaultResultOrder('ipv4first'); 

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
const PORT = process.env.PORT || 5000;


const runOneTimeMigration = async () => {
    try {
        console.log("[MIGRATION]: Checking for Physics WAEC data...");

        // Safety: Only duplicate if WAEC Physics questions don't exist yet
        const existingWaec = await Question.countDocuments({ 
            subject: "Physics", 
            examType: "WAEC" 
        });

        if (existingWaec > 0) {
            console.log(`[MIGRATION]: Skipping. ${existingWaec} WAEC questions already found.`);
            return;
        }

        // Find JAMB sources
        const jambQuestions = await Question.find({ 
            subject: "Physics", 
            examType: "JAMB" 
        }).lean();

        if (jambQuestions.length === 0) {
            console.log("[MIGRATION]: No JAMB Physics questions found to copy.");
            return;
        }

        // Create copies with new IDs and WAEC tag
        const waecCopies = jambQuestions.map(q => {
            const newDoc = { ...q };
            delete newDoc._id; 
            newDoc.examType = "WAEC";
            return newDoc;
        });

        await Question.insertMany(waecCopies);
        console.log(`[MIGRATION SUCCESS]: Duplicated ${waecCopies.length} questions to WAEC.`);
    } catch (err) {
        console.error("[MIGRATION ERROR]:", err);
    }
};



// MongoDB Connection
// ... [Place the runOneTimeMigration function definition above here] ...

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('🔥 MongoDB connected');

    // Runs the copy logic as soon as the DB is ready
    await runOneTimeMigration(); 

    // Once migration is done, start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  })	
  .catch(err => {
    console.error('❌ Connection error:', err);
    process.exit(1); // Exit if DB connection fails
  });
  
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

// --- REGISTER NEW USER ---
app.post('/admin/register-user', async (req, res) => {
    try {
        const { 
            firstName, middleName, lastName, gender, 
            email, phone, courseOfStudy, classLevel, 
            password, subjects, examType, department 
        } = req.body;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Auto-generate Reg Number (Original Format: SST26 + 4 digits + 2 letters)
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const randomLetters = chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)];
        const regNumber = `SST26${Math.floor(1000 + Math.random() * 9000)}${randomLetters}`.toUpperCase();
        
        // Subject Logic: Add English for JAMB, empty array for WAEC
        const finalSubjects = examType === 'JAMB' ? ['Use of English', ...subjects] : [];

        const newUser = new User({
            firstName, middleName, lastName, gender,
            email, phone, courseOfStudy, classLevel,
            password: hashedPassword,
            plainPassword: password, 
            examType, 
            department: examType === 'WAEC' ? department : 'N/A',
            regNo: regNumber,
            subjectCombination: finalSubjects
        });

        await newUser.save();
        
        res.json({ 
            success: true, 
            regNumber: newUser.regNo, 
            password: password, 
            user: newUser
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- UPDATE USER ---
app.put('/admin/users/:id', async (req, res) => {
    try {
        const { password, subjects, examType, ...otherData } = req.body;
        const updatePayload = { ...otherData, examType };

        // 1. Password update logic
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            updatePayload.password = await bcrypt.hash(password, salt);
            updatePayload.plainPassword = password;
        }
        
        // 2. Ensure RegNo exists (fallback)
        const existingUser = await User.findById(req.params.id);
        if (!existingUser.regNo) {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            const randomLetters = chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)];
            updatePayload.regNo = `SST26${Math.floor(1000 + Math.random() * 9000)}${randomLetters}`.toUpperCase();
        }

        // 3. Re-process subjects based on Exam Type
        if (examType === 'JAMB' && subjects) {
            updatePayload.subjectCombination = subjects.includes('Use of English') 
                ? subjects 
                : ['Use of English', ...subjects];
        } else if (examType === 'WAEC') {
            updatePayload.subjectCombination = [];
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, 
            { $set: updatePayload }, 
            { new: true }
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

// --- GET USERS (With Pagination - Matches Load Questions) ---
app.get('/admin/users', async (req, res) => {
    try {
        const { search, level, gender, course, page = 1, limit = 50 } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { regNo: { $regex: search, $options: 'i' } }
            ];
        }

        if (level) query.classLevel = level;
        if (gender) query.gender = gender;
        if (course) query.courseOfStudy = { $regex: course, $options: 'i' };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.json({ 
            success: true, 
            users, 
            total, // Total matching records
            count: total, // Keeping 'count' for your existing badge logic
            pages: Math.ceil(total / limit),
            currentPage: parseInt(page)
        });
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


/**
 * 1. ADD NEW QUESTION
 * Handles creation and ensures English passages OR group instructions are synced.
 */
app.post('/questions', async (req, res) => {
    try {
        const questionData = req.body;
        
        // Admin Tracking Defaults
        if (!questionData.createdBy) questionData.createdBy = "KeyzDelix";

        const newQuestion = new Question(questionData);
        await newQuestion.save();

        const { examType, subject, subTopic, subSubTopic, passage, instruction } = questionData;

        // --- SYNC LOGIC: PASSAGES ---
        // If it's English and has a passage, sync all questions in that specific subSubTopic
        if (subject.includes("English") && subSubTopic && passage) {
            await Question.updateMany(
                { examType, subject, subSubTopic },
                { $set: { passage: passage } }
            );
        }

        // --- SYNC LOGIC: INSTRUCTIONS ---
        // Sync instructions for ANY subject based on the subTopic group
        if (subTopic && instruction) {
            await Question.updateMany(
                { examType, subject, subTopic },
                { $set: { instruction: instruction } }
            );
        }

        res.json({ success: true, id: newQuestion._id });
    } catch (err) {
        console.error("Add Question Error:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 2. GET ALL QUESTIONS
 * Fetches all questions, sorted so the most recently touched are at the top.
 */
app.get('/questions', async (req, res) => {
    try {
        const questions = await Question.find().sort({ updatedAt: -1 });
        res.json(questions);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch questions: " + err.message });
    }
});

/**
 * 3. GET SINGLE QUESTION
 */
app.get('/questions/:id', async (req, res) => {
    try {
        const question = await Question.findById(req.params.id);
        if (!question) return res.status(404).json({ error: "Question not found" });
        res.json(question);
    } catch (err) {
        res.status(500).json({ error: "Fetch error" });
    }
});

/**
 * 4. UPDATE EXISTING QUESTION
 * Updates content and replicates changes to passages/instructions across the group.
 */
app.put('/questions/:id', async (req, res) => {
    try {
        const questionData = req.body;
        questionData.updatedBy = questionData.updatedBy || "KeyzDelix";

        const updatedQuestion = await Question.findByIdAndUpdate(
            req.params.id,
            questionData,
            { new: true }
        );

        if (!updatedQuestion) return res.status(404).json({ error: "Question not found" });

        const { examType, subject, subTopic, subSubTopic, passage, instruction } = updatedQuestion;

        // --- SYNC LOGIC: PASSAGES ---
        if (subject.includes("English") && subSubTopic && passage) {
            await Question.updateMany(
                { 
                    _id: { $ne: req.params.id }, // Don't update the current one again
                    examType, 
                    subject, 
                    subSubTopic 
                },
                { $set: { passage: passage } }
            );
        }

        // --- SYNC LOGIC: INSTRUCTIONS ---
        // When you edit the instruction for one question in a topic, it fixes the rest
        if (subTopic && instruction) {
            await Question.updateMany(
                { 
                    _id: { $ne: req.params.id },
                    examType, 
                    subject, 
                    subTopic 
                },
                { $set: { instruction: instruction } }
            );
        }

        res.json({ success: true, data: updatedQuestion });
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ error: "Update failed: " + err.message });
    }
});

/**
 * 5. DELETE QUESTION
 */
app.delete('/questions/:id', async (req, res) => {
    try {
        const deleted = await Question.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Question already deleted" });
        res.json({ success: true, message: "Question removed" });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
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



// Optimized View Script: Shows ONLY questions the student answered

app.get('/admin/view-script/:resultId/:subject', async (req, res) => {
    try {
        const { resultId, subject } = req.params;
        
        // 1. Get the Result document
        const result = await Result.findById(resultId);
        if (!result) return res.status(404).json({ error: "Result not found" });

        // 2. Locate the student session using the new Dual-ID logic
        // We look for a session matching the user AND either the blueprint OR the session ID
        const session = await Exam.findOne({ 
            userId: result.userId, 
            $or: [
                { _id: result.examSessionId }, // Match specific session
                { examId: result.examId }      // Fallback to blueprint ID
            ]
        });

        if (!session) {
            console.log(`Session not found for User: ${result.userId}, Exam: ${result.examId}`);
            return res.status(404).json({ error: "Student answer session not found." });
        }

        // 3. Filter responses (Case-insensitive to be safe)
        const responses = session.responses.filter(r => 
            r.subject.toLowerCase() === subject.toLowerCase()
        );
        
        // 4. Fetch Question details
        const questionIds = responses.map(r => r.questionId);
        const questions = await Question.find({ _id: { $in: questionIds } });

        const getFullUrl = (path) => {
            if (!path || path.startsWith('http')) return path;
            return `${process.env.BASE_URL || 'http://localhost:5000'}/${path.replace(/^\//, '')}`;
        };

        // 5. Build the script review with corrected image paths
        const script = responses.map(resp => {
            const q = questions.find(doc => doc._id.toString() === resp.questionId.toString());
            return {
                questionText: q ? q.questionText : "Question data missing",
                passage: q ? q.passage : "", 
                questionImage: q ? getFullUrl(q.questionImage) : "",
                options: q ? q.options.map(opt => ({
                    key: opt.key,
                    value: opt.value,
                    image: getFullUrl(opt.optionImage || opt.image) // Support both field names
                })) : [],
                correctKey: q ? q.correctOptionKey : null,
                selectedKey: resp.selectedOptionKey,
                isCorrect: q ? (String(resp.selectedOptionKey).trim() === String(q.correctOptionKey).trim()) : false,
                explanation: q ? q.explanation : ""
            };
        });

        // 6. Get stats from subjectResults array using the same case-insensitive check
        const subStats = result.subjectResults.find(s => 
            s.subjectName.toLowerCase() === subject.toLowerCase()
        ) || {};

        res.json({
            subject: subject.toUpperCase(),
            stats: {
                raw: subStats.rawScore2 || subStats.rawScore || 0,
                weighted: subStats.weightedScore2 || subStats.weightedScore || 0,
                normalized: subStats.normalizedScore2 || 0
            },
            questions: script
        });

    } catch (err) {
        console.error("View Script Error:", err);
        res.status(500).json({ error: "Server error retrieving review." });
    }
});




// 7. Admin: View All Results
app.get('/all-results', async (req, res) => {
    try {
        const results = await Result.find()
            .populate('userId', 'firstName lastName middleName regNumber regNo gender examAllocations')
            .sort({ preciseRankingScore: -1 });

        const cleanedResults = results.map(r => {
            const user = r.userId;
            
            // FIND THE RIGHT BATCH:
            // Look through the student's allocations for the one that matches this Result's examId
            let assignedBatch = "1"; // Default fallback
            if (user && user.examAllocations) {
                const matchingAllocation = user.examAllocations.find(alloc => 
                    alloc.examId && alloc.examId.toString() === r.examId.toString()
                );
                if (matchingAllocation) {
                    assignedBatch = matchingAllocation.batch || matchingAllocation.batchId || "1";
                }
            }

            return {
                _id: r._id,
                examId: r.examId,
                regNo: user?.regNumber || user?.regNo || "N/A",
                studentName: `${user?.lastName || ''}, ${user?.firstName || ''} ${user?.middleName || ''}`.trim().toUpperCase(),
                gender: user?.gender || "N/A",
                // THIS IS THE KEY:
                batchId: assignedBatch, 
                aggregateScore: r.aggregateScore || 0,
                preciseRankingScore: r.preciseRankingScore || 0,
                examDate: r.examDate,
                subjectResults: r.subjectResults || []
            };
        });

        res.json(cleanedResults);
    } catch (err) {
        console.error("All-Results Error:", err);
        res.status(500).json({ error: err.message });
    }
});



// GET ONE SPECIFIC RESULT (For PDF and Result Portal)

app.get('/results/:id', async (req, res) => {
    try {
        const result = await Result.findById(req.params.id)
            .populate('userId', 'firstName lastName middleName regNumber regNo gender');
        
        // Use examSessionId for the specific attempt data
        const examSession = await Exam.findById(result.examSessionId || result.examId).lean(); 

        // 1. Calculate Rank within this specific ExamConfig
        const allResults = await Result.find({ examId: result.examId }).sort({ preciseRankingScore: -1 });
        const rank = allResults.findIndex(r => r._id.toString() === result._id.toString()) + 1;
        const totalCandidates = allResults.length;

        const getFullUrl = (path) => {
            if (!path || path.startsWith('http')) return path;
            return `${process.env.BASE_URL || 'http://localhost:5000'}/${path.replace(/^\//, '')}`;
        };

        const detailedAnswers = [];
        if (examSession?.responses) {
            const questionIds = examSession.responses.map(r => r.questionId);
            const questions = await mongoose.model('Question').find({ _id: { $in: questionIds } }).lean();

            examSession.responses.forEach(resp => {
                const q = questions.find(item => item._id.toString() === resp.questionId.toString());
                if (q) {
                    detailedAnswers.push({
                        subject: resp.subject.toUpperCase(),
                        passage: q.passage || null,
                        questionText: q.questionText,
                        questionImage: getFullUrl(q.questionImage),
                        userChoice: resp.selectedOptionKey || "Skipped",
                        correctKey: q.correctOptionKey,
                        isCorrect: String(resp.selectedOptionKey).trim() === String(q.correctOptionKey).trim(),
                        options: (q.options || []).map(opt => ({
                            key: opt.key, 
                            value: opt.value, 
                            optionImage: getFullUrl(opt.optionImage)
                        }))
                    });
                }
            });
        }

        res.json({
            fullName: `${result.userId?.firstName || ''} ${result.userId?.middleName || ''} ${result.userId?.lastName || ''}`.trim().toUpperCase(),
            regNo: result.userId?.regNumber || result.userId?.regNo || "N/A",
            gender: result.userId?.gender || "N/A",
            examTitle: "JAMB STANDARD PERFORMANCE TRANSCRIPT",
            examDate: result.examDate, // Date and Time
            aggregateScore: result.aggregateScore,
            preciseScore: result.preciseRankingScore,
            rank: rank,
            totalCandidates: totalCandidates,
            timeTaken: result.timeTaken, // Total time in seconds
            subjectScores: (result.subjectResults || []).map(s => ({
                name: s.subjectName.toUpperCase(),
                correct: s.correctCount,
                total: s.totalQuestions,
                score: s.normalizedScore2, // Use normalized score for the slip
                timeSpent: examSession?.subjectAnalysis?.find(a => a.subjectName.toLowerCase() === s.subjectName.toLowerCase())?.secondsSpent || 0
            })),
            detailedAnswers
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
        id, 
        title, 
        subject,           // New: Track if it's Physics, Maths, etc.
        examType,          // New: WAEC or JAMB
        durationValue, 
        timingMode,        // New: general, perQuestion, or perSet
        setGroupSize,      // New: For "Per Set" timing
        maxAttempts, 
        shuffleType, 
        selectionMode,     // New: static or random
        shuffleSeed,       // New: The "DNA" string
        totalQuestions, 
        assignmentType, 
        startDateTime, 
        endDateTime, 
        batchSettings, 
        topicDistribution, 
        assignedStudents 
    } = req.body;

    // Package the data for MongoDB
    const data = {
        title,
        subject: subject || 'General',
        examType,
        durationValue,
        timingMode: timingMode || 'general',
        setGroupSize: setGroupSize || 5,
        maxAttempts,
        shuffleType,
        selectionMode: selectionMode || 'static',
        shuffleSeed: shuffleSeed || null, // Store as null if empty
        totalQuestions,
        assignmentType,
        startDateTime,
        endDateTime,
        batchSettings,
        topicDistribution,
        assignedStudents
    };

    try {
        if (id) {
            // Update existing
            await ExamConfig.findByIdAndUpdate(id, data);
            res.json({ message: "Exam Engine Updated Successfully" });
        } else {
            // Create new
            const newEx = new ExamConfig(data);
            await newEx.save();
            res.json({ message: "New Exam Engine Created" });
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



//Reset UserExamSession// GET: Fetch all students who have attempted a specific exam
app.get('/api/exams/attempts/:examId', async (req, res) => {
    try {
        const { examId } = req.params;
        
        // Find results where examId (Blueprint) OR examSessionId matches the target
        const results = await Result.find({ 
            $or: [{ examId: examId }, { examSessionId: examId }] 
        })
        .populate('userId', 'firstName lastName middleName regNo regNumber')
        .lean();
        
        const studentData = results.map(r => {
            const user = r.userId;
            return {
                userId: user?._id,
                regNo: user?.regNumber || user?.regNo || "N/A",
                name: user ? `${user.firstName} ${user.middleName || ''} ${user.lastName}`.trim().toUpperCase() : "DELETED USER",
                status: "Submitted",
                score: r.aggregateScore ?? r.totalWeightedScore ?? 0,
                examDate: r.examDate
            };
        });

        res.json(studentData);
    } catch (err) {
        console.error("Attempts Fetch Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/exams/reset/:examId', async (req, res) => {
    try {
        const { examId } = req.params; 
        const { type, regNumbers } = req.body;

        let userQuery = {};
        if (type === 'selected' && regNumbers && regNumbers.length > 0) {
            // Target specific students by their Reg Numbers
            const searchTerms = regNumbers.map(r => String(r));
            userQuery = {
                $or: [
                    { regNo: { $in: searchTerms } },
                    { regNumber: { $in: searchTerms } }
                ]
            };
        } else {
            // Target EVERYONE allocated to this specific exam blueprint
            userQuery = { "examAllocations.examId": examId };
        }

        const targetUsers = await User.find(userQuery).select('_id regNo regNumber');
        
        if (!targetUsers || targetUsers.length === 0) {
            return res.status(404).json({ message: "No students found to reset." });
        }

        const userIds = targetUsers.map(u => u._id);

        // 1. Wipe Result records
        // We look for the Blueprint ID (examId) OR the specific Session ID
        const resDelete = await Result.deleteMany({ 
            userId: { $in: userIds },
            $or: [{ examId: examId }, { examSessionId: examId }] 
        });

        // 2. Wipe Exam Sessions (The "live" progress)
        const examDelete = await Exam.deleteMany({ 
            userId: { $in: userIds },
            $or: [{ examId: examId }, { _id: examId }] // _id in Exam collection is the Session ID
        });

        // 3. Reset the 'hasTaken' flag in User Allocations
        // This is what allows them to click "Start Exam" again
        await User.updateMany(
            { _id: { $in: userIds } },
            { $set: { "examAllocations.$[elem].hasTaken": false } },
            { arrayFilters: [{ "elem.examId": examId }] }
        );

        res.json({ 
            success: true, 
            message: `Successfully reset ${userIds.length} student(s).`,
            details: {
                resultsDeleted: resDelete.deletedCount,
                sessionsDeleted: examDelete.deletedCount
            }
        });

    } catch (err) {
        console.error("Reset Route Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DISTRIBUTE 
// POST: Randomly assign students to batches

app.post('/api/exams/distribute-batches/:id', async (req, res) => {
    try {
        const examId = req.params.id;
        const { clearAll } = req.body;
        
        const exam = await ExamConfig.findById(examId);
        if (!exam) return res.status(404).json({ error: "Exam not found" });

        const studentRegs = exam.assignedStudents;
        const batches = exam.batchSettings;

        if (clearAll) {
            await User.updateMany(
                { regNo: { $in: studentRegs } },
                { $pull: { examAllocations: { examId: exam._id } } }
            );
        }

        // Identify unassigned students
        const allUsers = await User.find({ regNo: { $in: studentRegs } });
        const unassignedUsers = allUsers.filter(u => 
            !u.examAllocations.some(alloc => alloc.examId.toString() === examId)
        );

        if (unassignedUsers.length === 0) {
            return res.json({ message: "No unassigned students found." });
        }

        // SHUFFLE: Use the exam's shuffleSeed if it exists for consistent randomization,
        // otherwise use Math.random() for fresh distribution.
        const shuffled = unassignedUsers.sort(() => Math.random() - 0.5);

        // BALANCING LOGIC: 
        // Find current occupancy of each batch to fill the emptiest ones first
        const occupancyMap = {};
        batches.forEach(b => occupancyMap[b.batchNumber] = 0);
        
        allUsers.forEach(u => {
            const alloc = u.examAllocations.find(a => a.examId.toString() === examId);
            if (alloc) occupancyMap[alloc.batchNumber]++;
        });

        const updatePromises = shuffled.map((user, index) => {
            // Find batch with the smallest count
            const sortedBatches = [...batches].sort((a, b) => 
                occupancyMap[a.batchNumber] - occupancyMap[b.batchNumber]
            );
            
            const targetBatch = sortedBatches[0];
            occupancyMap[targetBatch.batchNumber]++; // Update map for next iteration

            return User.updateOne(
                { _id: user._id },
                { 
                    $push: { 
                        examAllocations: {
                            examId: exam._id,
                            title: exam.title,
                            batchNumber: targetBatch.batchNumber,
                            startTime: targetBatch.startTime,
                            endTime: targetBatch.endTime,
                            // Pass the Seed DNA to the student's allocation
                            shuffleSeed: exam.shuffleSeed 
                        } 
                    } 
                }
            );
        });

        await Promise.all(updatePromises);
        res.json({ message: `Assigned ${shuffled.length} new students.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/exams/move-student', async (req, res) => {
    const { regNo, examId, newBatchNumber } = req.body;
    
    try {
        // Find the exam to get the correct batch timing
        const exam = await ExamConfig.findById(examId);
        const batchInfo = exam.batchSettings.find(b => b.batchNumber == newBatchNumber);

        if (!batchInfo) return res.status(400).json({ error: "Invalid batch" });

        // Update the specific allocation in the User's array
        await User.updateOne(
            { regNo, "examAllocations.examId": examId },
            { 
                $set: { 
                    "examAllocations.$.batchNumber": parseInt(newBatchNumber),
                    "examAllocations.$.startTime": batchInfo.startTime,
                    "examAllocations.$.endTime": batchInfo.endTime
                } 
            }
        );
        
        res.json({ message: "Student moved successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: List of students assigned to a specific exam
app.get('/api/exams/assigned-students/:examId', async (req, res) => {
    try {
        const exam = await ExamConfig.findById(req.params.examId);
        if (!exam) return res.status(404).json({ error: "Exam not found" });

        // Find users whose regNo is in the exam's assigned list
        const users = await User.find({ regNo: { $in: exam.assignedStudents } })
                                .select('fullName regNo examAllocations');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EMAIL EXAM SCHEDULING

// Helper for the delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/exams/notify-students/:id', async (req, res) => {
    try {
        const examId = req.params.id;
        const { testEmail } = req.body; // New: Option to override recipient
        
        const exam = await ExamConfig.findById(examId);
        const users = await User.find({ "examAllocations.examId": examId });

        if (users.length === 0) {
            return res.status(400).json({ error: "No students allocated." });
        }

        // Send immediate response
        res.json({ message: `Dispatching emails to ${users.length} students...` });
        // Background Loop inside app.post('/api/exams/notify-students/:id')
for (const user of users) {
    const alloc = user.examAllocations.find(a => a.examId.toString() === examId);
    const recipient = testEmail || user.email;

    if (alloc && recipient) {
        try {
            // Formatting Name: LAST NAME, First Name Middle Name
            const lastName = (user.lastName || '').toUpperCase();
            const firstName = user.firstName || '';
            const middleName = user.middleName ? ` ${user.middleName}` : '';
            const fullName = `${lastName}, ${firstName}${middleName}`;

            await transporter.sendMail({
                from: '"SAVVY SCHOLARS TUTORS" <savvyscholarstutors@gmail.com>',
                to: recipient,
                subject: `Exam Schedule: ${exam.title}`,
                html: `
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 550px; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; color: #1e293b; line-height: 1.6;">
                        <h2 style="color: #2563eb; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">Exam Login Credentials</h2>
                        <p>Hello <b>${fullName}</b>,</p>
                        <p>Your personalized schedule for <b>${exam.title}</b> is now available. Please keep this information safe.</p>
                        
                        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 20px 0;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                                <tr><td style="padding: 5px 0;"><b>Registration No:</b></td><td>${user.regNo}</td></tr>
                                <tr><td style="padding: 5px 0;"><b>Exam
                                Password:</b></td><td style="color: #dc2626;
                                font-weight: bold; font-size:
                                1.1rem;">${user.plainPassword}</td></tr>
                                <tr><td colspan="2"><hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;"></td></tr>
                                <tr><td style="padding: 5px 0;"><b>Batch:</b></td><td>Batch ${alloc.batchNumber}</td></tr>
                                <tr><td style="padding: 5px 0;"><b>Date:</b></td><td>${new Date(alloc.startTime).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
                                <tr><td style="padding: 5px 0;"><b>Start Time:</b></td><td>${new Date(alloc.startTime).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })} (GMT+1)</td></tr>
                                <tr><td style="padding: 5px 0;"><b>End Time:</b></td><td>${new Date(alloc.endTime).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })} (GMT+1)</td></tr>
                                <tr><td style="padding: 5px 0;"><b>Duration:</b></td><td>120 Minutes (2 Hours)</td></tr>
                            </table>
                        </div>

                        <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 20px;">
                            <p style="margin: 0; font-size: 0.9rem; color: #92400e;">
                                <b>Important Instruction:</b> Please ensure you sit for your exam within the time window allocated above. Your login credentials will <u>only</u> be active during this period.
                            </p>
                        </div>

                        <p style="font-size: 0.8rem; color: #64748b; margin-top: 25px; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
                            Powered by SAVVY SCHOLARS TUTORS CBT System
                        </p>
                    </div>
                `
            });
            console.log(`Success: Notified ${user.regNo} @ ${recipient}`);
            await delay(3500); 
        } catch (e) {
            console.error(`Mail Error for ${user.regNo}:`, e.message);
        }
    }
}

    } catch (err) {
        console.error("Critical Notify Error:", err);
    }
});


app.get('/admin/user-history/:userId', async (req, res) => {
    try {
        const history = await Result.find({ userId: req.params.userId })
            .populate('examId', 'name title') 
            .select('examId examDate aggregateScore preciseRankingScore subjectResults')
            .sort({ examDate: -1 })
            .lean();

        const formattedHistory = history.map(h => ({
            resultId: h._id,
            examBlueprintId: h.examId?._id || h.examId, // Pass the ID for filtering
            examName: h.examId?.name || h.examId?.title || "Unknown Exam",
            date: h.examDate,
            score: h.aggregateScore || 0,
            precise: h.preciseRankingScore || 0,
            subjectCount: h.subjectResults ? h.subjectResults.length : 0
        }));

        res.json(formattedHistory);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



const FRONTEND_BASE = process.env.FRONTEND_URL || "http://127.0.0.1:8158";
router.post('/publish', async (req, res) => {
    const { resultIds, isTest = false } = req.body;
    
    try {
        const results = await Result.find({ _id: { $in: resultIds } }).populate('studentId');
        
        for (let result of results) {
            const student = result.studentId;
            // Use your defined BASE_URL for the portal link
            const resultLink = `${FRONTEND_BASE}/CBT-SYSTEM/frontend/result-portal.html?id=${result._id}`;
            
            // Build the Subject Score HTML rows
            const subjectRows = result.subjectScores.map(s => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px; color: #475569;">${s.subject}</td>
                    <td style="padding: 10px; font-weight: bold; text-align: right;">${s.score}%</td>
                </tr>
            `).join('');

            await transporter.sendMail({
                from: '"The Math Workshop" <exams@themathworkshop.com>',
                to: student.email,
                subject: isTest ? `[TEST] Result Notification: ${result.examTitle}` : `Result Published: ${result.examTitle}`,
                html: `
                    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px;">
                        <h2 style="color: #1e293b; margin-top: 0;">Hello ${student.fullName},</h2>
                        <p style="color: #475569;">Your performance report for <b>${result.examTitle}</b> is now ready.</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <thead>
                                <tr style="background: #f8fafc; text-align: left;">
                                    <th style="padding: 10px; color: #6366f1;">Subject</th>
                                    <th style="padding: 10px; color: #6366f1; text-align: right;">Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${subjectRows}
                                <tr style="background: #6366f1; color: white;">
                                    <td style="padding: 12px; font-weight: bold; border-bottom-left-radius: 8px;">AGGREGATE</td>
                                    <td style="padding: 12px; font-weight: bold; text-align: right; border-bottom-right-radius: 8px;">${result.totalScore}%</td>
                                </tr>
                            </tbody>
                        </table>

                        <p style="color: #475569;">Click the button below to view your full script analysis and download your official result slip:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resultLink}" style="background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                View Full Result & Script
                            </a>
                        </div>
                        
                        <p style="font-size: 0.8rem; color: #94a3b8; text-align: center;">
                            Reg No: ${student.regNo} | Date: ${new Date().toLocaleDateString()}
                        </p>
                    </div>
                `
            });

            if (!isTest) {
                result.isPublished = true;
                await result.save();
            }
        }
        res.json({ success: true, message: isTest ? "Test email sent!" : "Results published and emails sent!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/questions/topics/:subject', async (req, res) => {
    try {
        const { subject } = req.params;
        // This finds all unique topics for the selected subject
        const topics = await Question.distinct("topic", { subject: subject });
        res.json(topics);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch topics: " + err.message });
    }
});




// --- AUTHENTICATION: LOGIN API ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { regNumber, password } = req.body;
        
        // 1. Find user and normalize Reg Number
        // Using plainPassword as per your existing schema structure
        const user = await User.findOne({ 
            regNo: regNumber.trim().toUpperCase(), 
            plainPassword: password.trim() 
        });

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid Registration Number or PIN" 
            });
        }

        const now = new Date().getTime();
        const gracePeriod = 30 * 60 * 1000; // 30-minute window before start

        // 2. Process allocations to determine exam status
        const processedAllocations = await Promise.all(user.examAllocations.map(async (alloc) => {
            const a = alloc.toObject ? alloc.toObject() : alloc;
            
            const start = new Date(a.startTime).getTime();
            const end = new Date(a.endTime).getTime();

            let status = "scheduled";
            let canClick = false;

            // Determine visibility and clickability
            if (a.hasTaken) {
                status = "submitted";
            } else if (now >= (start - gracePeriod) && now <= end) {
                status = "active";
                canClick = true;
            } else if (now > end) {
                status = "expired";
            }

            // 3. Check for an existing active session to allow Resumption
            const existingSession = await Exam.findOne({ 
                userId: user._id, 
                examId: a.examId, 
                status: 'active' 
            });

            return {
                ...a,
                currentStatus: status,
                canClick: canClick,
                resumeSessionId: existingSession ? existingSession._id : null
            };
        }));

        // 4. Return clean User and Allocation data to Frontend
        res.json({
            success: true,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                regNo: user.regNo,
                subjectCombination: user.subjectCombination,
                subject: user.subject,
                batchNumber: user.batchNumber || 1 // Essential for our seeded shuffle
            },
            allocations: processedAllocations
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Server Error during authentication." 
        });
    }
});

// --- GET EXAM CONFIG FOR INSTRUCTIONS ---
app.get('/api/exams/config/:id', async (req, res) => {
    try {
        const config = await ExamConfig.findById(req.params.id);
        
        if (!config) {
            return res.status(404).json({ error: "Configuration not found" });
        }

        // Return the full config so the frontend can access title, instructions, etc.
        res.json(config);
    } catch (err) {
        console.error("Config Fetch Error:", err);
        res.status(500).json({ error: "Failed to load exam instructions" });
    }
});

// --- 1. START OR RESUME EXAM ---
// --- 1. START OR RESUME EXAM ---
app.post('/api/exams/start-exam', async (req, res) => {
    try {
        const { userId, examId } = req.body;
        const user = await User.findById(userId);
        const config = await ExamConfig.findById(examId);

        if (!user || !config) return res.status(404).json({ error: "Context not found" });

        // Max Attempt Check
        const attemptCount = await Exam.countDocuments({ userId, examId, status: { $in: ['submitted', 'timed-out'] } });
        if (attemptCount >= (config.maxAttempts || 1)) {
            return res.status(403).json({ error: "Maximum attempts reached." });
        }

        let examSession = await Exam.findOne({ userId, examId, status: 'active' });

        if (!examSession) {
            let subjectsToLoad = [];
            
            // LOGIC SPLIT: JAMB vs WAEC/Internal
            if (config.examType === 'JAMB') {
                subjectsToLoad = user.subjectCombination; 
            } else {
                // Fetch unique subjects from the topicDistribution schema
                // This ensures the engine looks for 'Mathematics' if that's what is in the config
                subjectsToLoad = [...new Set(config.topicDistribution.map(d => d.subject))];
            }

            if (subjectsToLoad.length === 0) {
                return res.status(400).json({ error: "No subjects defined in Exam Config." });
            }

            examSession = new Exam({
                userId,
                examId,
                subjectCombination: subjectsToLoad,
                status: 'active',
                startTime: new Date(),
                totalSecondsRemaining: (config.durationValues || 120) * 60,
                responses: []
            });
            await examSession.save();
        }

        res.json({ examId: examSession._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- 2. FETCH QUESTIONS (Updated with Topic Logic & Debugging) ---
app.get('/api/exams/fetch-questions/:sessionId', async (req, res) => {
    try {
        const session = await Exam.findById(req.params.sessionId).populate('userId');
        const config = await ExamConfig.findById(session.examId);
        if (!session || !config) return res.status(404).json({ error: "Session or Config missing" });

        const isEnglish = (sub) => sub.toLowerCase().includes('english');

        const sanitize = (q, subject) => {
            const plain = q.toObject ? q.toObject() : q;
            let options = plain.options || [];
            const shouldShuffleOptions = config.shuffleType === 'both' || (config.shuffleType === 'smart' && !isEnglish(subject));
            if (shouldShuffleOptions && options.length > 0) {
                options = [...options].sort(() => 0.5 - Math.random());
            }
            return {
                ...plain,
                questionText: plain.questionText || plain.question,
                options
            };
        };

        // RESUMPTION LOGIC
        if (session.questionsServed && session.questionsServed.length > 0) {
            const questions = await Question.find({ _id: { $in: session.questionsServed } });
            const results = session.subjectCombination.map(sub => ({
                subject: sub,
                questions: questions.filter(q => q.subject === sub).map(q => sanitize(q, sub))
            }));
            return res.json({ 
                subjects: results, 
                totalSecondsRemaining: session.totalSecondsRemaining,
                timerMode: config.timerMode 
            });
        }

        // FRESH GENERATION
        const results = [];
        let allServedIds = [];
        const batchNum = session.userId.batchNumber || 1;

        for (const sub of session.subjectCombination) {
            let finalQuestions = [];
            const dist = config.topicDistribution?.filter(d => d.subject === sub);

            if (dist && dist.length > 0) {
                console.log(`[DEBUG]: Processing distribution for ${sub}`);
                for (const d of dist) {
                    // Smart Query: Trim spaces and handle optional subTopics
                    const query = { 
                        subject: sub, 
                        topic: d.topic.trim() 
                    };
                    if (d.subTopic && d.subTopic.trim() !== "") {
                        query.subTopic = d.subTopic.trim();
                    }

                    let topicQs = await Question.find(query);
                    console.log(`[DEBUG]: Found ${topicQs.length} questions for topic: ${d.topic}`);

                    // FALLBACK: If no questions match the specific topic/subtopic, 
                    // grab any questions from that subject so the UI doesn't break.
                    if (topicQs.length === 0) {
                        console.warn(`[DEBUG]: Fallback triggered for ${sub} - ${d.topic}`);
                        topicQs = await Question.find({ subject: sub }).limit(parseInt(d.qty));
                    }

                    const pool = getBatchPool(topicQs, batchNum, parseInt(d.qty), config.shuffleSeed);
                    finalQuestions.push(...pool.slice(0, parseInt(d.qty)));
                }
            } 
            else if (config.examType === 'JAMB') {
                const qtyNeeded = isEnglish(sub) ? 60 : 40;
                const allSubQs = await Question.find({ subject: sub });
                const pool = getBatchPool(allSubQs, batchNum, qtyNeeded, config.shuffleSeed);
                finalQuestions = pool.slice(0, qtyNeeded);
            }

            // Shuffle Question Order
            const shouldShuffleOrder = config.shuffleType === 'both' || (config.shuffleType === 'smart' && !isEnglish(sub));
            if (shouldShuffleOrder) {
                finalQuestions.sort(() => Math.random() - 0.5);
            } 

            const sanitized = finalQuestions.map(q => sanitize(q, sub));
            results.push({ subject: sub, questions: sanitized });
            allServedIds.push(...sanitized.map(q => q._id));
        }

        session.questionsServed = allServedIds;
        await session.save();

        res.json({ 
            subjects: results, 
            totalSecondsRemaining: session.totalSecondsRemaining,
            timerMode: config.timerMode 
        });

    } catch (err) {
        console.error("[SERVER ERROR]:", err);
        res.status(500).json({ error: err.message });
    }
});
// --- 3. SUBMIT & SCORE ---
app.post('/api/exams/submit-exam', async (req, res) => {
    try {
        const { examId, responses, subjectAnalysis, status, totalSecondsRemaining } = req.body;
        const session = await Exam.findById(examId);
        const config = await ExamConfig.findById(session.examId);

        session.responses = responses;
        session.status = status;
        session.totalSecondsRemaining = totalSecondsRemaining;

        if (status === 'submitted' || status === 'timed-out') {
            const subjectResults = await calculateScore(responses, session, config);
            
            const aggregate = subjectResults.reduce((acc, curr) => acc + curr.normalizedScore2, 0);
            const precise = subjectResults.reduce((acc, curr) => acc + curr.normalizedScore1, 0);

            const finalResult = await Result.findOneAndUpdate(
                { examSessionId: session._id },
                {
                    userId: session.userId,
                    examId: session.examId,
                    examSessionId: session._id,
                    subjectResults,
                    aggregateScore: aggregate,
                    preciseRankingScore: parseFloat(precise.toFixed(3)),
                    timeTaken: (config.duration * 60) - totalSecondsRemaining,
                    examType: config.examType
                },
                { upsert: true, new: true }
            );

            await User.updateOne(
                { _id: session.userId, "examAllocations.examId": session.examId },
                { $set: { "examAllocations.$.hasTaken": true } }
            );

            if (config.examType === 'JAMB') {
                const scoring = require('./scoring');
                scoring.runNormalization(Result, session.examId).catch(console.error);
            }

            await session.save();
            return res.json({ success: true, data: finalResult });
        }

        await session.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Seeded Batch Pool Helper
function getBatchPool(allQs, batchNum, qtyNeeded, masterSeed = 123) {
    if (!allQs.length) return [];
    const seed = (batchNum * masterSeed);
    let m = allQs.length, t, i;
    let pool = [...allQs];
    while (m) {
        i = Math.floor(Math.abs(Math.sin(seed + m) * m--));
        t = pool[m]; pool[m] = pool[i]; pool[i] = t;
    }
    return pool;
}

// Unified Result Calculator
async function calculateScore(responses, session, config) {
    const questions = await Question.find({ _id: { $in: session.questionsServed } });
    const isWAEC = config.examType === 'WAEC';

    return session.subjectCombination.map(subName => {
        const subQuestions = questions.filter(q => q.subject === subName);
        let correct = 0, sumCorrectWeight = 0, sumServedWeight = 0;

        subQuestions.forEach(q => {
            const weight = q.weight || 1;
            sumServedWeight += weight;
            const userRes = responses.find(r => String(r.questionId) === String(q._id));
            if (userRes && String(userRes.selectedOptionKey).trim() === String(q.answer).trim()) {
                correct++;
                sumCorrectWeight += weight;
            }
        });

        // Denominator Logic
        let fixedTotal = 0;
        if (config.examType === 'JAMB') {
            fixedTotal = subName.toLowerCase().includes('english') ? 60 : 40;
        } else {
            const totalInDist = config.topicDistribution
                ?.filter(d => d.subject === subName)
                .reduce((acc, curr) => acc + curr.qty, 0);
            fixedTotal = totalInDist || subQuestions.length;
        }

        // Padding weights for missing questions
        const missing = Math.max(0, fixedTotal - subQuestions.length);
        const totalPossibleWeight = sumServedWeight + (missing * 1);

        const raw1 = (correct / fixedTotal) * 100;
        const weighted1 = totalPossibleWeight > 0 ? (sumCorrectWeight / totalPossibleWeight) * 100 : 0;

        const res = {
            subjectName: subName,
            actualScore: correct,
            totalQuestions: fixedTotal,
            rawScore1: raw1,
            rawScore2: Math.round(raw1),
            weightedScore1: weighted1,
            weightedScore2: Math.round(weighted1),
            normalizedScore1: raw1, // Pre-normalization
            normalizedScore2: Math.round(raw1)
        };

        if (isWAEC) {
            res.grade = getWAECGrade(res.weightedScore2);
            res.normalizedScore1 = weighted1; // For WAEC, weight is the final score
            res.normalizedScore2 = Math.round(weighted1);
        }

        return res;
    });
}

function getWAECGrade(s) {
    if (s >= 75) return "A1"; if (s >= 70) return "B2"; if (s >= 65) return "B3";
    if (s >= 60) return "C4"; if (s >= 55) return "C5"; if (s >= 50) return "C6";
    if (s >= 45) return "D7"; if (s >= 40) return "E8"; return "F9";
}




module.exports = router;
// Server Initialization
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
 //  console.log(`🚀 Server running on port ${PORT}`);
// });

