	// ================= BACKEND =================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Question = require('./models/Question');
const Result = require('./models/Result');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'));

app.post('/questions', async (req, res) => {
  const q = new Question(req.body);
  await q.save();
  res.json(q);
});
app.get('/questions', async (req, res) => {
  const questions = await Question.find();

  const safeQuestions = questions.map(q => ({
    _id: q._id,
    subject: q.subject,
    question: q.question,
    options: q.options
  }));

  res.json(safeQuestions);
});

app.post('/submit', async (req, res) => {
  const result = new Result(req.body);
  await result.save();
  res.json(result);
});
app.get('/results', async (req, res) => {
  const results = await Result.find().sort({ date: -1 });
  res.json(results);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// 
