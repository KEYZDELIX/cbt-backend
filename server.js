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
    const ExamConfig = require('./models/ExamConfig');
    const config = await ExamConfig.findById(examConfigId);

    if (!config || !config.englishDist || config.englishDist.length === 0) return [];

    // Helper to shuffle questions within a specific block
    const shuffle = (array) => array.sort(() => Math.random() - 0.5);

    for (const dist of config.englishDist) {
        try {
            // Match the topic from your config (e.g., "Cloze Passage")
            const isPassageTopic = ["Comprehension Passages", "Cloze Passage"].includes(dist.topic);

            if (isPassageTopic) {
                const passages = await Question.distinct("subSubTopic", { 
                    subject: "Use of English",
                    subTopic: dist.topic 
                });

                if (passages.length > 0) {
                    const selectedPassage = passages[Math.floor(Math.random() * passages.length)];
                    const passageQuestions = await Question.find({ 
                        subject: "Use of English",
                        subTopic: dist.topic,
                        subSubTopic: selectedPassage
                    });

                    // For Passages: We usually keep them in order (1, 2, 3...) 
                    // so the flow of the story makes sense.
                    const orderedPassageQs = passageQuestions.sort((a, b) => a._id - b._id);
                    paper.push(...orderedPassageQs.slice(0, dist.qty));
                }
            } else {
                // For Lexis, Structure, Oral: 
                // We  the requested quantity and then SHUFFLE them.
                const qs = await Question.aggregate([
                    { $match: { 
                        subject: "Use of English", 
                        subTopic: dist.topic 
                    }},
                    { $sample: { size: dist.qty } }
                ]);
                
                if (qs.length > 0) {
                    // Shuffle this specific batch so Student A and B 
                    // see "Antonyms" in a different order.
                    const shuffledBatch = shuffle(qs);
                    paper.push(...shuffledBatch);
                }
            }
        } catch (e) {
            console.error(`Error in English Section ${dist.topic}:`, e);
        }
    }
    return paper; 
}

// Helper to generate a batch-specific random pool with controlled overlap
function getBatchPool(allQuestions, batchNum, questionsPerStudent) {
    const totalAvailable = allQuestions.length;
    // We want a pool size that gives variety but stays batch-consistent
    // Ideally 1.5x the number of questions a student needs
    const poolSize = Math.min(totalAvailable, Math.floor(questionsPerStudent * 1.5));
    
    // Use the batchNum to create a 'seeded' shuffle
    // This ensures every student in Batch 1 sees the SAME pool
    const seededShuffle = (arr, seed) => {
        let m = arr.length, t, i;
        while (m) {
            i = Math.floor(Math.abs(Math.sin(seed++) * m--));
            t = arr[m];
            arr[m] = arr[i];
            arr[i] = t;
        }
        return arr;
    };

    // Shuffle the entire bank based on Batch Number
    const batchSpecificOrderedBank = seededShuffle([...allQuestions], batchNum * 123);
    
    // Take the first 'poolSize' questions. 
    // Because of the seed, Batch 1 and Batch 2 will have different starting orders
    // and therefore different pools, but with natural overlap.
    return batchSpecificOrderedBank.slice(0, poolSize);
}

app.get('/api/exams/fetch-questions/:examId', async (req, res) => {
    try {
        const { examId } = req.params;
        const session = await Exam.findById(examId).populate('userId');
        const config = await ExamConfig.findById(session.examId);
        const batchNumber = session.batchId || 1;

        let subjects = session.subjectCombination || session.userId.subjectCombination;
        const results = [];

        for (const sub of subjects) {
            const qtyNeeded = sub === "Use of English" ? 60 : 40;
            let finalQuestions = [];

            if (sub === "Use of English") {
                // English follows the Sectional Flow logic we built earlier
                finalQuestions = await getEnglishPaper(config._id);
            } else {
                const allSubQuestions = await Question.find({ subject: sub });
                
                // 1. Generate the Pool for this specific Batch
                const batchPool = getBatchPool(allSubQuestions, batchNumber, qtyNeeded);

                // 2. Pull the student's specific set from that Batch Pool
                // We use standard random shuffle here so students in the same batch 
                // have different orders and slightly different questions
                const studentSet = batchPool
                    .sort(() => Math.random() - 0.5)
                    .slice(0, qtyNeeded);

                finalQuestions = studentSet.map(q => {
                    const plainQ = q.toObject();
                    return {
                        ...plainQ,
                        questionText: plainQ.questionText || plainQ.question,
                        options: plainQ.options ? [...plainQ.options].sort(() => 0.5 - Math.random()) : []
                    };
                });
            }

            results.push({ subject: sub, questions: finalQuestions });
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




app.post('/api/exams/start-exam', async (req, res) => {
    try {
        const { userId, examId } = req.body;

        if (!examId) {
            return res.status(400).json({ error: "No Exam ID provided" });
        }

        // Search for an existing active session for this specific blueprint
        let exam = await Exam.findOne({ userId, examId, status: 'active' });

        if (!exam) {
            const user = await User.findById(userId);
            if (!user) return res.status(404).json({ error: "User not found" });

            // Safety check for allocations
            const allocation = user.examAllocations?.find(a => 
                a.examId?.toString() === examId.toString()
            );

            if (allocation && allocation.hasTaken) {
                return res.status(403).json({ 
                    error: "EXAM_ALREADY_TAKEN", 
                    message: "You have already submitted this exam attempt." 
                });
            }

            // Create the NEW session
            exam = new Exam({
                userId: user._id,
                examId: examId, // Blueprint ID
                subjectCombination: user.subjectCombination, 
                status: 'active',
                startTime: new Date()
            });
            
            // FIXED: Added .save()
            await exam.save(); 
        }

        // Return the unique SESSION ID (_id)
        res.json({ examId: exam._id }); 
    } catch (err) {
        console.error("Start Exam Error:", err);
        res.status(500).json({ error: err.message });
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



// POST /api/exams/submit-exam


app.post('/api/exams/submit-exam', async (req, res) => {
    try {
        const { userId, examId, responses, subjectAnalysis, totalSecondsRemaining, status } = req.body;

        // 1. Update/Create the Exam Session (Session ID is examId here)
        const updatedExam = await Exam.findOneAndUpdate(
            { _id: examId, userId },
            { 
                $set: { 
                    responses, 
                    subjectAnalysis, 
                    totalSecondsRemaining, 
                    status, 
                    endTime: (status === 'submitted' || status === 'timed-out') ? new Date() : null 
                } 
            },
            { new: true }
        );

        if (!updatedExam) {
            return res.status(404).json({ error: "Exam session not found." });
        }

        // 2. SCORING ENGINE
        const subjectResults = [];
        const userSubjects = updatedExam.subjectCombination || [];
        let runningPreciseSum = 0;

        for (const subName of userSubjects) {
            const isEnglish = subName.toLowerCase().includes('english');
            const expectedTotal = isEnglish ? 60 : 40;

            // Fetch pool to calculate "Perfect Weight" denominator
            const poolQuestions = await Question.find({ subject: subName });
            const actualCountInDb = poolQuestions.length;
            const weightInDb = poolQuestions.reduce((acc, q) => acc + (q.weight || 1), 0);

            // JAMB-Standard Denominator logic
            let totalPossibleWeight;
            if (actualCountInDb < expectedTotal) {
                const missingCount = expectedTotal - actualCountInDb;
                totalPossibleWeight = weightInDb + (missingCount * 1.0);
            } else {
                totalPossibleWeight = weightInDb;
            }

            // Calculate Student Performance
            const subResponses = responses.filter(r => r.subject === subName);
            let correctCount = 0;
            let earnedWeight = 0;

            for (const resp of subResponses) {
                const q = poolQuestions.find(item => item._id.toString() === resp.questionId.toString());
                if (q && q.correctOptionKey) {
                    if (q.correctOptionKey.trim().toUpperCase() === resp.selectedOptionKey.trim().toUpperCase()) {
                        correctCount++;
                        earnedWeight += (q.weight || 1);
                    }
                }
            }

            // Calculations
            const rScore1 = (correctCount / expectedTotal) * 100;
            const wScore1 = totalPossibleWeight > 0 ? (earnedWeight / totalPossibleWeight) * 100 : 0;

            subjectResults.push({
                subjectName: subName,
                correctCount,
                totalQuestions: expectedTotal,
                rawScore1: rScore1,
                rawScore2: Math.round(rScore1),
                weightedScore1: wScore1,
                weightedScore2: Math.round(wScore1),
                normalizedScore1: wScore1, // Initial fallback
                normalizedScore2: Math.round(wScore1)
            });

            runningPreciseSum += wScore1;
        }

        const totalWeightedInteger = Math.round(subjectResults.reduce((acc, s) => acc + s.weightedScore2, 0));

        // 3. Update the Result Record
        // Use updatedExam.examId (the blueprint ID) for the result grouping
        const finalResult = await Result.findOneAndUpdate(
            { userId, examId: updatedExam._id },
            { 
                userId, 
                examId: updatedExam.examId, // Blueprint link
                examSessionId: updatedExam._id, // Specific attempt link
                subjectResults, 
                aggregateScore: totalWeightedInteger, 
                totalWeightedScore: totalWeightedInteger,
                preciseRankingScore: parseFloat(runningPreciseSum.toFixed(3)), // For Ranking
                timeTaken: 7200 - totalSecondsRemaining,
                examDate: new Date()
            },
            { upsert: true, new: true }
        );

        // 4. Finalize & Normalize
        if (status === 'submitted' || status === 'timed-out') {
            // Mark user allocation as taken
            await User.updateOne(
                { _id: userId, "examAllocations.examId": updatedExam.examId },
                { $set: { "examAllocations.$.hasTaken": true } }
            );
            
            // Run the Statistical Curve (Normalization)
            try {
                // Pass the Result model and the Blueprint ID
                await runNormalization(Result, updatedExam.examId);
            } catch (nErr) {
                console.error("Normalization Trigger Error:", nErr);
            }

            return res.json({ 
                success: true, 
                status: "finished", 
                aggregate: finalResult.aggregateScore,
                precise: finalResult.preciseRankingScore 
            });
        }

        // Response for Auto-save (Active writing)
        res.json({ 
            success: true, 
            status: "active", 
            currentAggregate: totalWeightedInteger 
        });

    } catch (err) {
        console.error("Critical Submit Error:", err);
        res.status(500).json({ error: err.message });
    }
});


// 7. Admin: View All Results

app.get('/all-results', async (req, res) => {
    try {
        // 1. Fetch results and populate User data
        // We include 'examAllocations' to extract the Batch Number
        const results = await Result.find()
            .populate('userId', 'firstName lastName middleName regNumber regNo gender examAllocations')
            .sort({ preciseRankingScore: -1 });

        const cleanedResults = results.map(r => {
            const user = r.userId;
            
            // 2. Extract the Batch ID from the specific allocation
            // We find the allocation where the examId matches the Result's examId
            let batchNumber = "N/A";
            if (user && user.examAllocations) {
                const allocation = user.examAllocations.find(alloc => 
                    alloc.examId.toString() === r.examId.toString()
                );
                batchNumber = allocation ? (allocation.batch || allocation.batchId || "1") : "1";
            }

            return {
                _id: r._id,
                // Full name construction
                studentName: user ? `${user.firstName} ${user.middleName || ''} ${user.lastName}`.trim().toUpperCase() : "UNKNOWN",
                // Handle both registration number field possibilities
                regNo: user?.regNumber || user?.regNo || "N/A",
                gender: user?.gender || "N/A",
                // Dynamic Batch from User Allocations
                batchId: batchNumber,
                // Scores
                aggregateScore: r.aggregateScore || 0,
                preciseRankingScore: r.preciseRankingScore || 0,
                examDate: r.examDate,
                // Include subject results for the table expansion if needed
                subjectResults: r.subjectResults
            };
        });

        res.json(cleanedResults);
    } catch (err) {
        console.error("All-Results Fetch Error:", err);
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

// DISTRIBUTE batches
// POST: Randomly assign students to batches
app.post('/api/exams/distribute-batches/:id', async (req, res) => {
    try {
        const examId = req.params.id;
        const { clearAll } = req.body; // New: Option to reset
        
        const exam = await ExamConfig.findById(examId);
        if (!exam) return res.status(404).json({ error: "Exam not found" });

        const studentRegs = exam.assignedStudents;
        const batches = exam.batchSettings;

        if (!batches || batches.length === 0) {
            return res.status(400).json({ error: "No batches defined." });
        }

        // 1. If 'clearAll' is requested, remove all allocations for this exam first
        if (clearAll) {
            await User.updateMany(
                { regNo: { $in: studentRegs } },
                { $pull: { examAllocations: { examId: exam._id } } }
            );
        }

        // 2. Identify students who DON'T have an allocation for this exam yet
        const users = await User.find({ regNo: { $in: studentRegs } });
        const unassignedUsers = users.filter(u => 
            !u.examAllocations.some(alloc => alloc.examId.toString() === examId)
        );

        if (unassignedUsers.length === 0) {
            return res.json({ message: "All students are already assigned. No changes made.", count: 0 });
        }

        // 3. Shuffle ONLY the unassigned students
        const shuffled = [...unassignedUsers].sort(() => Math.random() - 0.5);

        // 4. Distribute across batches (filling batches evenly)
        const updatePromises = shuffled.map((user, index) => {
            const batchIdx = index % batches.length; // Round-robin assignment
            const b = batches[batchIdx];

            return User.updateOne(
                { _id: user._id },
                { 
                    $push: { 
                        examAllocations: {
                            examId: exam._id,
                            title: exam.title,
                            batchNumber: b.batchNumber,
                            startTime: new Date(b.startTime), // Use saved batch date/time
                            endTime: new Date(b.endTime)
                        } 
                    } 
                }
            );
        });

        await Promise.all(updatePromises);
        res.json({ 
            message: "Distribution successful", 
            count: shuffled.length, 
            batches: batches.length,
            status: clearAll ? "Fresh distribution" : "Added unassigned students only"
        });
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

module.exports = router;
// Server Initialization
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

