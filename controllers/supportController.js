const User = require('../models/User');
const ExamSession = require('../models/ExamSession'); // Or your candidate session model
const SupportTicket = require('../models/SupportTicket');
const bcrypt = require('bcryptjs');

// 1. Candidate Lookup (Search by email, regNo, phone, or name)
exports.lookupCandidate = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Search query parameter is required." });
    }

    const filter = {
      role: 'CANDIDATE',
      $or: [
        { email: { $regex: query, $options: 'i' } },
        { registrationNumber: { $regex: query, $options: 'i' } },
        { fullName: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } }
      ]
    };

    // Scope to tenant unless SUPER_ADMIN bypasses
    if (req.organizationId) {
      filter.organizationId = req.organizationId;
    }

    const candidates = await User.find(filter)
      .select('-password')
      .limit(20);

    res.status(200).json({
      count: candidates.length,
      candidates
    });
  } catch (error) {
    res.status(500).json({ error: "Candidate lookup failed.", details: error.message });
  }
};

// 2. Helpdesk Reset Candidate Password
exports.resetCandidatePassword = async (req, res) => {
  try {
    const { candidateId, newPassword } = req.body;

    if (!candidateId || !newPassword) {
      return res.status(400).json({ error: "Candidate ID and new password are required." });
    }

    const filter = { _id: candidateId, role: 'CANDIDATE' };
    if (req.organizationId) {
      filter.organizationId = req.organizationId;
    }

    const candidate = await User.findOne(filter);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found in this organization." });
    }

    const salt = await bcrypt.genSalt(10);
    candidate.password = await bcrypt.hash(newPassword, salt);
    await candidate.save();

    res.status(200).json({ message: "Candidate password reset successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset candidate password.", details: error.message });
  }
};

// 3. Unlock Candidate Exam Session (E.g., after crash, disconnection, or lockout)
exports.unlockCandidateSession = async (req, res) => {
  try {
    const { sessionId, candidateId } = req.body;

    const filter = {};
    if (sessionId) filter._id = sessionId;
    if (candidateId) filter.candidate = candidateId;
    if (req.organizationId) filter.organizationId = req.organizationId;

    const session = await ExamSession.findOne(filter);

    if (!session) {
      return res.status(404).json({ error: "Exam session not found." });
    }

    session.isLocked = false;
    session.lockReason = null;
    session.status = 'IN_PROGRESS';
    await session.save();

    res.status(200).json({
      message: "Candidate session unlocked successfully.",
      sessionId: session._id
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to unlock session.", details: error.message });
  }
};

// 4. Create Support Ticket
exports.createSupportTicket = async (req, res) => {
  try {
    const { subject, description, priority = 'MEDIUM', category } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ error: "Subject and description are required." });
    }

    const ticket = await SupportTicket.create({
      organizationId: req.organizationId,
      createdBy: req.user.id,
      subject,
      description,
      priority,
      category,
      status: 'OPEN'
    });

    res.status(201).json({ message: "Support ticket created successfully.", ticket });
  } catch (error) {
    res.status(500).json({ error: "Failed to create support ticket.", details: error.message });
  }
};

// 5. Get Support Tickets (Scoped by role & tenant)
exports.getSupportTickets = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (req.organizationId) filter.organizationId = req.organizationId;
    if (status) filter.status = status;

    // If candidate, only show their own tickets
    if (req.user.role === 'CANDIDATE') {
      filter.createdBy = req.user.id;
    }

    const tickets = await SupportTicket.find(filter)
      .populate('createdBy', 'fullName email registrationNumber role')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await SupportTicket.countDocuments(filter);

    res.status(200).json({
      tickets,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalTickets: total
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch support tickets.", details: error.message });
  }
};