const ExamSession = require('../models/ExamSession');
const ExamConfig = require('../models/ExamConfig');

// Get all exam sessions for tenant
exports.getExamSessions = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const sessions = await ExamSession.find({ organizationId })
      .populate('examConfigId', 'title subject examType paperType durationValue')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create a new scheduled session for an ExamConfig
exports.createExamSession = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;
    const { examConfigId } = req.body;

    // Verify target ExamConfig exists in tenant
    const config = await ExamConfig.findOne({ _id: examConfigId, organizationId });
    if (!config) {
      return res.status(404).json({ success: false, error: 'Target exam blueprint not found' });
    }

    const session = await ExamSession.create({
      ...req.body,
      organizationId,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      message: 'Exam session scheduled successfully',
      data: session
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get single session details
exports.getExamSessionById = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const session = await ExamSession.findOne({ _id: req.params.id, organizationId })
      .populate('examConfigId');

    if (!session) {
      return res.status(404).json({ success: false, error: 'Exam session not found' });
    }

    res.status(200).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update session settings
exports.updateExamSession = async (req, res) => {
  try {
    const { organizationId } = req.user;

    const session = await ExamSession.findOneAndUpdate(
      { _id: req.params.id, organizationId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, error: 'Exam session not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Exam session updated successfully',
      data: session
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Delete exam session
exports.deleteExamSession = async (req, res) => {
  try {
    const { organizationId } = req.user;

    const session = await ExamSession.findOneAndDelete({ _id: req.params.id, organizationId });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Exam session not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Exam session deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};