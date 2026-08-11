const ExamConfig = require('../models/ExamConfig');

// Get all exam blueprints for tenant
exports.getExamConfigs = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const configs = await ExamConfig.find({ organizationId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: configs.length,
      data: configs
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create new exam blueprint
exports.createExamConfig = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;

    const config = await ExamConfig.create({
      ...req.body,
      organizationId,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      message: 'Exam blueprint created successfully',
      data: config
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Get single blueprint details
exports.getExamConfigById = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const config = await ExamConfig.findOne({ _id: req.params.id, organizationId });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Exam blueprint not found' });
    }

    res.status(200).json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update blueprint
exports.updateExamConfig = async (req, res) => {
  try {
    const { organizationId } = req.user;

    const config = await ExamConfig.findOneAndUpdate(
      { _id: req.params.id, organizationId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!config) {
      return res.status(404).json({ success: false, error: 'Exam blueprint not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Exam blueprint updated successfully',
      data: config
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Delete blueprint
exports.deleteExamConfig = async (req, res) => {
  try {
    const { organizationId } = req.user;

    const config = await ExamConfig.findOneAndDelete({ _id: req.params.id, organizationId });

    if (!config) {
      return res.status(404).json({ success: false, error: 'Exam blueprint not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Exam blueprint deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};