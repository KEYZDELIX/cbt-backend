const Exam = require('../models/Exam');
const ExamSession = require('../models/ExamSession');
const ExamConfig = require('../models/ExamConfig');
const Question = require('../models/Question');

/**
 * Helper to retrieve questions array across schema variations
 */
const getQuestionsList = (attemptDoc) => {
  if (!attemptDoc) return [];
  return attemptDoc.questions || attemptDoc.questionSnapshots || attemptDoc.answers || [];
};

/**
 * Helper to generate question snapshots from blueprint config
 */
const generateSnapshots = async (organizationId, config) => {
  const questions = await Question.find({
    organizationId,
    subject: config.subject,
    examType: config.examType,
    paperType: config.paperType,
    status: 'APPROVED'
  }).limit(config.totalQuestions);

  return questions.map((q, index) => ({
    questionId: q._id,
    sequenceNumber: index + 1,
    questionText: q.questionText,
    options: q.options.map(opt => ({
      optionKey: opt.optionKey,
      optionText: opt.optionText
    })),
    selectedOption: null,
    isFlagged: false,
    secondsSpent: 0
  }));
};

/**
 * 1. Start or Resume Candidate Exam Attempt
 * Endpoint: POST /api/exams/start
 */
exports.startExam = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;
    const { sessionId, accessPin } = req.body;

    const session = await ExamSession.findOne({ 
      _id: sessionId, 
      organizationId 
    }).populate('examConfigId');

    if (!session) {
      return res.status(404).json({ success: false, error: 'Exam session not found.' });
    }

    if (session.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'This exam session is not active.' });
    }

    const now = new Date();
    if (now < new Date(session.startDateTime) || now > new Date(session.endDateTime)) {
      return res.status(403).json({ success: false, error: 'Exam session is outside the scheduled time window.' });
    }

    if (session.accessPin && session.accessPin !== accessPin) {
      return res.status(401).json({ success: false, error: 'Invalid access PIN for this exam session.' });
    }

    const config = session.examConfigId;
    if (!config) {
      return res.status(400).json({ success: false, error: 'Linked exam configuration blueprint is missing.' });
    }

    const questionSnapshots = await generateSnapshots(organizationId, config);
    if (questionSnapshots.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Insufficient approved questions found for ${config.subject} (${config.examType}).` 
      });
    }

    const existingAttempts = await Exam.find({ 
      sessionId: session._id, 
      userId, 
      organizationId 
    });

    const activeAttempt = existingAttempts.find(exp => exp.status === 'active');
    
    if (activeAttempt) {
      if (activeAttempt.expiresAt && new Date() >= new Date(activeAttempt.expiresAt)) {
        activeAttempt.status = 'expired';
        await activeAttempt.save();
        return res.status(403).json({ success: false, error: 'Exam time expired while you were away.' });
      }

      let activeList = getQuestionsList(activeAttempt);
      if (activeList.length === 0) {
        activeAttempt.questions = questionSnapshots;
        activeAttempt.questionSnapshots = questionSnapshots;
        activeAttempt.answers = questionSnapshots;
        await activeAttempt.save();
      }

      return res.status(200).json({
        success: true,
        message: 'Resuming active exam attempt',
        resumed: true,
        data: activeAttempt
      });
    }

    const completedAttempts = existingAttempts.filter(exp => ['submitted', 'expired'].includes(exp.status));
    if (completedAttempts.length >= (config.maxAttempts || 1)) {
      return res.status(403).json({ success: false, error: 'Maximum allowed attempt limit reached for this exam.' });
    }

    const startTime = new Date();
    const durationMinutes = config.durationValue || 60;
    const expiresAt = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    const attempt = await Exam.create({
      organizationId,
      userId,
      sessionId: session._id,
      examConfigId: config._id,
      questions: questionSnapshots,
      questionSnapshots: questionSnapshots,
      answers: questionSnapshots,
      startTime,
      expiresAt,
      status: 'active'
    });

    res.status(201).json({
      success: true,
      message: 'Exam started successfully',
      resumed: false,
      data: attempt
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 2. Real-time Response & Question Flagging Sync
 * Endpoint: POST /api/exams/:examId/answer
 */
exports.submitAnswer = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;
    const { examId } = req.params;
    const { questionId, selectedOption, isFlagged, secondsSpent } = req.body;

    const attempt = await Exam.findOne({ _id: examId, userId, organizationId });

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'Exam attempt not found.' });
    }

    if (attempt.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Exam attempt is no longer active.' });
    }

    if (attempt.expiresAt && new Date() > new Date(attempt.expiresAt)) {
      attempt.status = 'expired';
      await attempt.save();
      return res.status(403).json({ success: false, error: 'Time limit exceeded. Exam expired.' });
    }

    let questionsList = getQuestionsList(attempt);

    // Auto-repair if attempt record was created with empty questions
    if (questionsList.length === 0) {
      const session = await ExamSession.findOne({ _id: attempt.sessionId, organizationId }).populate('examConfigId');
      if (session && session.examConfigId) {
        const questionSnapshots = await generateSnapshots(organizationId, session.examConfigId);
        attempt.questions = questionSnapshots;
        attempt.questionSnapshots = questionSnapshots;
        attempt.answers = questionSnapshots;
        await attempt.save();
        questionsList = getQuestionsList(attempt);
      }
    }

    if (questionsList.length === 0) {
      return res.status(400).json({ success: false, error: 'No questions registered for this exam attempt.' });
    }

    const qIndex = questionsList.findIndex(q => {
      const targetId = q.questionId || q._id;
      return targetId && targetId.toString() === questionId;
    });

    if (qIndex === -1) {
      return res.status(404).json({ success: false, error: 'Question not found in this exam attempt.' });
    }

    if (selectedOption !== undefined) {
      questionsList[qIndex].selectedOption = selectedOption;
    }
    if (isFlagged !== undefined) {
      questionsList[qIndex].isFlagged = isFlagged;
    }
    if (secondsSpent) {
      questionsList[qIndex].secondsSpent = (questionsList[qIndex].secondsSpent || 0) + secondsSpent;
    }

    attempt.markModified('questions');
    attempt.markModified('questionSnapshots');
    attempt.markModified('answers');

    await attempt.save();

    res.status(200).json({ 
      success: true, 
      message: 'Response synced successfully',
      data: {
        questionId,
        selectedOption: questionsList[qIndex].selectedOption,
        isFlagged: questionsList[qIndex].isFlagged
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 3. Final Submission & Automated Grading Engine
 * Endpoint: POST /api/exams/:examId/submit
 */
exports.submitExam = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;
    const { examId } = req.params;

    const attempt = await Exam.findOne({ _id: examId, userId, organizationId })
      .populate('examConfigId');

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'Exam attempt not found.' });
    }

    if (attempt.status === 'submitted') {
      return res.status(400).json({ success: false, error: 'Exam has already been submitted.' });
    }

    let questionsList = getQuestionsList(attempt);
    if (questionsList.length === 0 && attempt.sessionId) {
      const session = await ExamSession.findOne({ _id: attempt.sessionId, organizationId }).populate('examConfigId');
      if (session && session.examConfigId) {
        const questionSnapshots = await generateSnapshots(organizationId, session.examConfigId);
        attempt.questions = questionSnapshots;
        attempt.questionSnapshots = questionSnapshots;
        attempt.answers = questionSnapshots;
        await attempt.save();
        questionsList = getQuestionsList(attempt);
      }
    }

    const questionIds = questionsList.map(q => q.questionId || q._id);
    const masterQuestions = await Question.find({ _id: { $in: questionIds } });
    const questionMap = new Map(masterQuestions.map(q => [q._id.toString(), q]));

    let totalScore = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalUnanswered = 0;

    questionsList.forEach(snapshot => {
      const qId = snapshot.questionId || snapshot._id;
      const originalQuestion = questionMap.get(qId ? qId.toString() : '');

      if (!snapshot.selectedOption) {
        totalUnanswered++;
      } else if (originalQuestion && snapshot.selectedOption === originalQuestion.correctOptionKey) {
        totalCorrect++;
        totalScore += (originalQuestion.marks || 1);
      } else {
        totalWrong++;
      }
    });

    const totalQuestions = questionsList.length;
    const percentage = totalQuestions > 0 ? parseFloat(((totalCorrect / totalQuestions) * 100).toFixed(2)) : 0;

    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    attempt.score = totalScore;
    attempt.metrics = {
      totalQuestions,
      totalCorrect,
      totalWrong,
      totalUnanswered,
      percentage
    };

    await attempt.save();

    res.status(200).json({
      success: true,
      message: 'Exam submitted and graded successfully',
      data: {
        examId: attempt._id,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        score: attempt.score,
        metrics: attempt.metrics
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 4. Get Active State or Submission Result
 * Endpoint: GET /api/exams/:examId
 */
exports.getExamById = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;
    const attempt = await Exam.findOne({ _id: req.params.examId, userId, organizationId })
      .populate('examConfigId', 'title subject examType paperType durationValue');

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'Exam attempt not found.' });
    }

    res.status(200).json({ success: true, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};