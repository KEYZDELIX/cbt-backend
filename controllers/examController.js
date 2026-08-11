const Exam = require('../models/Exam');
const ExamSession = require('../models/ExamSession');
const ExamConfig = require('../models/ExamConfig');

// 1. Start or resume a candidate exam attempt
exports.startExam = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;
    const { sessionId, accessPin } = req.body;

    // Verify Session
    const session = await ExamSession.findOne({ _id: sessionId, organizationId, status: 'ACTIVE' });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Active exam session not found' });
    }

    if (session.accessPin && session.accessPin !== accessPin) {
      return res.status(401).json({ success: false, error: 'Invalid access PIN' });
    }

    // Check existing attempt or create new one
    let attempt = await Exam.findOne({ userId, sessionId, status: 'active' });
    if (!attempt) {
      const config = await ExamConfig.findById(session.examConfigId);
      const durationSeconds = (config.durationValue || 60) * 60;

      attempt = await Exam.create({
        organizationId,
        userId,
        examConfigId: config._id,
        sessionId: session._id,
        paperType: config.paperType,
        totalSecondsRemaining: durationSeconds,
        startTime: new Date(),
        endTime: new Date(Date.now() + durationSeconds * 1000)
      });
    }

    res.status(200).json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Save candidate response / answer
exports.submitAnswer = async (req, res) => {
  try {
    const { examId } = req.params;
    const { questionId, selectedOptionKey, secondsSpent } = req.body;

    const attempt = await Exam.findById(examId);
    if (!attempt || attempt.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Exam attempt is no longer active' });
    }

    const existingResponseIndex = attempt.responses.findIndex(
      (r) => r.questionId.toString() === questionId
    );

    if (existingResponseIndex > -1) {
      attempt.responses[existingResponseIndex].selectedOptionKey = selectedOptionKey;
      attempt.responses[existingResponseIndex].secondsSpentOnQuestion += secondsSpent || 0;
    } else {
      attempt.responses.push({ questionId, selectedOptionKey, secondsSpentOnQuestion: secondsSpent || 0 });
    }

    await attempt.save();
    res.status(200).json({ success: true, message: 'Response saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 3. Final submission of candidate exam
exports.submitExam = async (req, res) => {
  try {
    const { examId } = req.params;

    const attempt = await Exam.findById(examId);
    if (!attempt) return res.status(404).json({ success: false, error: 'Attempt not found' });

    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();

    res.status(200).json({ success: true, message: 'Exam submitted successfully', data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};