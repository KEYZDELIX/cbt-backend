	// ================= BACKEND =================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Question = require('./models/Question');
const Result = require('./models/Result');
const User = require('./models/User');
const Exam = require('./models/Exam');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))	
.catch(err => console.log(err));

app.get('/', (req, res) => {
  res.send('CBT Backend is running...');
});

app.post('/start-exam', async (req, res) => {
  const { name, subjects } = req.body;

  const user = new User({ name, subjects });
  await user.save();

  const exam = new Exam({ userId: user._id });
  await exam.save();

  res.json({ userId: user._id, examId: exam._id });
});

app.post('/generate-questions', async (req, res) => {
  const { subjects } = req.body;

  let allQuestions = [];

  for (let subject of subjects) {
    const limit = subject === "Use of English" ? 60 : 40;

    const qs = await Question.aggregate([
      { $match: { subject } },
      { $sample: { size: limit } }
    ]);

    allQuestions.push(...qs);
  }

  res.json(allQuestions);
});

app.post('/save-answer', async (req, res) => {
  const { examId, questionId, selected } = req.body;

  const exam = await Exam.findById(examId);
  const question = await Question.findById(questionId);

  const existing = exam.answers.find(a => a.questionId == questionId);

  if (existing) {
    existing.selected = selected;
  } else {
    exam.answers.push({
      questionId,
      selected,
      correct: question.answer,
      weight: question.weight
    });
  }

  await exam.save();

  res.json({ message: "Saved" });
});

app.post('/submit-exam', async (req, res) => {
  const { examId } = req.body;

  const exam = await Exam.findById(examId);

  let score = 0;

  exam.answers.forEach(a => {
    if (a.selected === a.correct) {
      score += a.weight;
    }
  });

  exam.score = score;
  exam.completed = true;

  await exam.save();

  res.json({ score, total: 400 });
});

app.get('/exam-results', async (req, res) => {
  const exams = await Exam.find().sort({ createdAt: -1 });
  res.json(exams);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// 
