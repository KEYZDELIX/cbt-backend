const Exam = require('../models/Exam');

// 1. Get all exams for tenant
exports.getExams = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const exams = await Exam.find({ organizationId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: exams.length,
      data: exams
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Create new exam
exports.createExam = async (req, res) => {
  try {
    const { organizationId, id: userId } = req.user;

    const exam = await Exam.create({
      ...req.body,
      organizationId,
      createdBy: userId
    });

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: exam
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// 3. Get single exam details
exports.getExamById = async (req, res) => {
  try {
    const { organizationId } = req.user;
    const exam = await Exam.findOne({ _id: req.params.id, organizationId });

    if (!exam) {
      return res.status(404).json({ success: false, error: 'Exam not found' });
    }

    res.status(200).json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 4. Update exam details
exports.updateExam = async (req, res) => {
  try {
    const { organizationId } = req.user;

    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, organizationId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!exam) {
      return res.status(404).json({ success: false, error: 'Exam not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Exam updated successfully',
      data: exam
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// 5. Delete exam
exports.deleteExam = async (req, res) => {
  try {
    const { organizationId } = req.user;

    const exam = await Exam.findOneAndDelete({ _id: req.params.id, organizationId });

    if (!exam) {
      return res.status(404).json({ success: false, error: 'Exam not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Exam deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};