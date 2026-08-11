const ExamSession = require('../models/ExamSession');

// 1. Get real-time active exam sessions
exports.getLiveSessions = async (req, res) => {
  try {
    const organizationId = req.organizationId || req.user?.organizationId;

    const liveSessions = await ExamSession.find({
      organizationId,
      status: 'IN_PROGRESS'
    })
      .populate('candidateId', 'firstName lastName email candidateCode profilePicture')
      .populate('examId', 'title code durationMinutes');

    res.status(200).json({
      success: true,
      count: liveSessions.length,
      sessions: liveSessions
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch live sessions.',
      details: error.message
    });
  }
};

// 2. Manually terminate candidate session
exports.terminateCandidateSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const session = await ExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found.' });
    }

    session.status = 'TERMINATED';
    session.submittedAt = new Date();
    session.proctorLogs.push({
      eventType: 'FORCE_SUBMIT',
      timestamp: new Date(),
      note: reason || 'Manually terminated by proctor for malpractice'
    });

    await session.save();

    res.status(200).json({
      message: 'Candidate session terminated successfully.',
      session
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to terminate candidate session.',
      details: error.message
    });
  }
};

// 3. Log a proctor violation warning
exports.flagViolation = async (req, res) => {
  try {
    const { id } = req.params;
    const { violationType, details } = req.body;

    const session = await ExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found.' });
    }

    if (session.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Session is no longer active.' });
    }

    session.proctorLogs.push({
      eventType: violationType || 'TAB_SWITCH',
      timestamp: new Date(),
      note: details || ''
    });

    if (violationType === 'TAB_SWITCH') {
      session.tabSwitchCount = (session.tabSwitchCount || 0) + 1;
    }

    await session.save();

    res.status(200).json({
      message: 'Violation logged successfully.',
      tabSwitchCount: session.tabSwitchCount,
      logsCount: session.proctorLogs.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to log violation.',
      details: error.message
    });
  }
};

// 4. Verify candidate identity
exports.verifyCandidateIdentity = async (req, res) => {
  try {
    const { candidateId, examId, verified } = req.body;

    if (!candidateId || !examId) {
      return res.status(400).json({ error: 'candidateId and examId are required.' });
    }

    res.status(200).json({
      success: true,
      verified: Boolean(verified),
      message: verified ? 'Identity verified. Exam unlocked.' : 'Identity verification failed.'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to verify candidate identity.',
      details: error.message
    });
  }
};