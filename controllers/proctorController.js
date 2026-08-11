const ExamSession = require('../models/ExamSession');

// 1. Log candidate proctoring violation (tab switch, lost focus, exit fullscreen)
exports.logProctorEvent = async (req, res) => {
  try {
    const { sessionId, eventType } = req.body;

    if (!sessionId || !eventType) {
      return res.status(400).json({ error: 'sessionId and eventType are required.' });
    }

    const session = await ExamSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found.' });
    }

    if (session.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Session is no longer active.' });
    }

    // Append violation to proctor logs
    session.proctorLogs.push({ eventType, timestamp: new Date() });

    if (eventType === 'TAB_SWITCH' || eventType === 'FULLSCREEN_EXIT') {
      session.tabSwitchCount += 1;
    }

    // Auto-terminate session if tab switches exceed threshold (e.g., 5 switches)
    if (session.tabSwitchCount >= 5) {
      session.status = 'TERMINATED';
      session.submittedAt = new Date();
      session.proctorLogs.push({
        eventType: 'FORCE_SUBMIT',
        timestamp: new Date()
      });
    }

    await session.save();

    res.status(200).json({
      message: 'Proctor event logged.',
      tabSwitchCount: session.tabSwitchCount,
      status: session.status
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to log proctor event.', 
      details: error.message 
    });
  }
};

// 2. Get proctoring log history for a specific session (Admin / Proctor view)
exports.getProctorLogs = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await ExamSession.findById(sessionId)
      .populate('candidateId', 'firstName lastName email candidateCode')
      .populate('examId', 'title code');

    if (!session) {
      return res.status(404).json({ error: 'Exam session not found.' });
    }

    res.status(200).json({
      candidate: session.candidateId,
      exam: session.examId,
      status: session.status,
      tabSwitchCount: session.tabSwitchCount,
      logs: session.proctorLogs
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch proctor logs.', 
      details: error.message 
    });
  }
};

// 3. Force terminate candidate exam session
exports.terminateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await ExamSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found.' });
    }

    session.status = 'TERMINATED';
    session.submittedAt = new Date();
    session.proctorLogs.push({
      eventType: 'FORCE_SUBMIT',
      timestamp: new Date()
    });

    await session.save();

    res.status(200).json({ 
      message: 'Exam session terminated successfully.', 
      session 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to terminate session.', 
      details: error.message 
    });
  }
};