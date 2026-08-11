const Exam = require('../models/Exam');
const ExamSession = require('../models/ExamSession');
const Question = require('../models/Question');

/**
 * Helper to populate questionsServed and initial responses if an exam attempt is missing them.
 */
const repairExamQuestions = async (examDoc, organizationId) => {
  if (examDoc.questionsServed && examDoc.questionsServed.length > 0) {
    return examDoc;
  }

  // Populate config from session or config reference
  let config = examDoc.examConfigId;
  if (!config || !config.subject) {
    const session = await ExamSession.findOne({ _id: examDoc.sessionId, organizationId }).populate('examConfigId');
    if (session && session.examConfigId) {
      config = session.examConfigId;
    }
  }

  if (!config) return examDoc;

  // Query database for matching approved questions
  const queryFilter = {
    organizationId,
    status: 'APPROVED'
  };

  if (config.subject) queryFilter.subject = config.subject;
  if (config.examType) queryFilter.examType = config.examType;
  if (config.paperType) queryFilter.paperType = config.paperType;

  let questions = await Question.find(queryFilter).limit(config.totalQuestions || 50);

  // Fallback query if subject/examType matching is too strict
  if (questions.length === 0) {
    questions = await Question.find({ organizationId, status: 'APPROVED' }).limit(config.totalQuestions || 50);
  }

  if (questions.length > 0) {
    const questionIds = questions.map(q => q._id);
    examDoc.questionsServed = questionIds;
    examDoc.responses = questions.map(q => ({
      questionId: q._id,
      selectedOptionKey: null,
      isMarkedForReview: false,
      subject: q.subject || config.subject || '',
      secondsSpentOnQuestion: 0,
      timestamp: new Date()
    }));

    examDoc.markModified('questionsServed');
    examDoc.markModified('responses');
    await examDoc.save();
  }

  return examDoc;
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
      return res.status(403).json({ success: false, error: 'Exam session is outside scheduled time window.' });
    }

    if (session.accessPin && session.accessPin !== accessPin) {
      return res.status(401).json({ success: false, error: 'Invalid access PIN.' });
    }

    const config = session.examConfigId;
    if (!config) {
      return res.status(400).json({ success: false, error: 'Linked exam configuration blueprint is missing.' });
    }

    // Check existing attempts
    const existingAttempts = await Exam.find({ 
      sessionId: session._id, 
      userId, 
      organizationId 
    });

    let activeAttempt = existingAttempts.find(exp => exp.status === 'active');

    if (activeAttempt) {
      if (activeAttempt.endTime && new Date() >= new Date(activeAttempt.endTime)) {
        activeAttempt.status = 'timed-out';
        await activeAttempt.save();
        return res.status(403).json({ success: false, error: 'Exam time expired.' });
      }

      // Self-heal active attempt if questionsServed is empty
      activeAttempt = await repairExamQuestions(activeAttempt, organizationId);

      const populatedAttempt = await Exam.findById(activeAttempt._id).populate('questionsServed');

      return res.status(200).json({
        success: true,
        message: 'Resuming active exam attempt',
        resumed: true,
        data: populatedAttempt
      });
    }

    const completedAttempts = existingAttempts.filter(exp => ['submitted', 'timed-out'].includes(exp.status));
    if (completedAttempts.length >= (config.maxAttempts || 1)) {
      return res.status(403).json({ success: false, error: 'Maximum allowed attempt limit reached.' });
    }

    // Query questions to initialize new exam
    const questions = await Question.find({
      organizationId,
      subject: config.subject,
      examType: config.examType,
      paperType: config.paperType || 'OBJ',
      status: 'APPROVED'
    }).limit(config.totalQuestions || 50);

    if (questions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: `No approved questions found for ${config.subject} (${config.examType}).` 
      });
    }

    const questionIds = questions.map(q => q._id);
    const startTime = new Date();
    const durationMinutes = config.durationValue || 60;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    const totalSecondsRemaining = durationMinutes * 60;

    const initialResponses = questions.map(q => ({
      questionId: q._id,
      selectedOptionKey: null,
      isMarkedForReview: false,
      subject: q.subject || config.subject,
      secondsSpentOnQuestion: 0,
      timestamp: new Date()
    }));

    const attempt = await Exam.create({
      organizationId,
      userId,
      sessionId: session._id,
      examConfigId: config._id,
      paperType: config.paperType || 'OBJ',
      status: 'active',
      questionsServed: questionIds,
      responses: initialResponses,
      currentSubject: config.subject,
      startTime,
      endTime,
      totalSecondsRemaining
    });

    const populatedAttempt = await Exam.findById(attempt._id).populate('questionsServed');

    res.status(201).json({
      success: true,
      message: 'Exam started successfully',
      resumed: false,
      data: populatedAttempt
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
    
    // Accepts either standard schema properties or generic payload keys
    const { 
      questionId, 
      selectedOption, 
      selectedOptionKey, 
      isFlagged, 
      isMarkedForReview, 
      secondsSpent, 
      secondsSpentOnQuestion 
    } = req.body;

    let attempt = await Exam.findOne({ _id: examId, userId, organizationId });

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'Exam attempt not found.' });
    }

    if (attempt.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Exam attempt is no longer active.' });
    }

    if (attempt.endTime && new Date() > new Date(attempt.endTime)) {
      attempt.status = 'timed-out';
      await attempt.save();
      return res.status(403).json({ success: false, error: 'Time limit exceeded. Exam timed out.' });
    }

    // Auto-repair if questionsServed is empty on the current record
    attempt = await repairExamQuestions(attempt, organizationId);

    const finalOption = selectedOptionKey !== undefined ? selectedOptionKey : selectedOption;
    const finalFlag = isMarkedForReview !== undefined ? isMarkedForReview : isFlagged;
    const finalSeconds = secondsSpentOnQuestion !== undefined ? secondsSpentOnQuestion : secondsSpent;

    const isServed = attempt.questionsServed.some(qId => qId.toString() === questionId);
    if (!isServed) {
      return res.status(404).json({ 
        success: false, 
        error: `Question ${questionId} is not in questionsServed for this exam attempt.` 
      });
    }

    let respIndex = attempt.responses.findIndex(r => r.questionId.toString() === questionId);

    if (respIndex === -1) {
      attempt.responses.push({
        questionId,
        selectedOptionKey: finalOption || null,
        isMarkedForReview: finalFlag || false,
        secondsSpentOnQuestion: finalSeconds || 0,
        timestamp: new Date()
      });
      respIndex = attempt.responses.length - 1;
    } else {
      if (finalOption !== undefined) {
        attempt.responses[respIndex].selectedOptionKey = finalOption;
      }
      if (finalFlag !== undefined) {
        attempt.responses[respIndex].isMarkedForReview = finalFlag;
      }
      if (finalSeconds) {
        attempt.responses[respIndex].secondsSpentOnQuestion = 
          (attempt.responses[respIndex].secondsSpentOnQuestion || 0) + finalSeconds;
      }
      attempt.responses[respIndex].timestamp = new Date();
    }

    attempt.markModified('responses');
    await attempt.save();

    res.status(200).json({
      success: true,
      message: 'Response synced successfully',
      data: attempt.responses[respIndex]
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

    let attempt = await Exam.findOne({ _id: examId, userId, organizationId });

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'Exam attempt not found.' });
    }

    if (attempt.status === 'submitted') {
      return res.status(400).json({ success: false, error: 'Exam has already been submitted.' });
    }

    attempt = await repairExamQuestions(attempt, organizationId);

    const masterQuestions = await Question.find({ _id: { $in: attempt.questionsServed } });
    const questionMap = new Map(masterQuestions.map(q => [q._id.toString(), q]));

    let totalScore = 0;
    let maxPossibleScore = 0;

    attempt.responses.forEach(resp => {
      const q = questionMap.get(resp.questionId.toString());
      if (q) {
        const marks = q.marks || 1;
        maxPossibleScore += marks;
        if (resp.selectedOptionKey && resp.selectedOptionKey === q.correctOptionKey) {
          resp.isCorrect = true;
          totalScore += marks;
        } else {
          resp.isCorrect = false;
        }
      }
    });

    const percentage = maxPossibleScore > 0 ? parseFloat(((totalScore / maxPossibleScore) * 100).toFixed(2)) : 0;

    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    attempt.totalScore = totalScore;
    attempt.maxPossibleScore = maxPossibleScore;
    attempt.percentage = percentage;

    attempt.markModified('responses');
    await attempt.save();

    res.status(200).json({
      success: true,
      message: 'Exam submitted and graded successfully',
      data: {
        examId: attempt._id,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        totalScore: attempt.totalScore,
        maxPossibleScore: attempt.maxPossibleScore,
        percentage: attempt.percentage
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
    let attempt = await Exam.findOne({ _id: req.params.examId, userId, organizationId });

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'Exam attempt not found.' });
    }

    attempt = await repairExamQuestions(attempt, organizationId);

    const populated = await Exam.findById(attempt._id)
      .populate('examConfigId', 'title subject examType paperType durationValue')
      .populate('questionsServed');

    res.status(200).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};