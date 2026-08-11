const crypto = require('crypto');
const AccessPin = require('../models/AccessPin');
const Transaction = require('../models/Transaction');

// Generate a batch of unique exam access PINs
exports.generateAccessPins = async (req, res) => {
  try {
    const { count = 10, examId, batchName } = req.body;
    const organizationId = req.organizationId;

    if (!examId) {
      return res.status(400).json({ error: "Exam ID is required for PIN generation." });
    }

    const pinsToInsert = [];
    for (let i = 0; i < count; i++) {
      const randomBytes = crypto.randomBytes(4).toString('hex').toUpperCase();
      const pinCode = `PIN-${randomBytes.slice(0, 4)}-${randomBytes.slice(4)}`;
      
      pinsToInsert.push({
        pinCode,
        organizationId,
        examId,
        batchName: batchName || 'General Batch',
        isUsed: false,
        createdBy: req.user.id
      });
    }

    const createdPins = await AccessPin.insertMany(pinsToInsert);

    res.status(201).json({
      message: `Successfully generated ${createdPins.length} access PINs.`,
      count: createdPins.length,
      pins: createdPins
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate PINs.", details: error.message });
  }
};

// Get PINs scoped to the organization
exports.getAccessPins = async (req, res) => {
  try {
    const { isUsed, batchName, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (req.organizationId) query.organizationId = req.organizationId;
    if (isUsed !== undefined) query.isUsed = isUsed === 'true';
    if (batchName) query.batchName = batchName;

    const pins = await AccessPin.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await AccessPin.countDocuments(query);

    res.status(200).json({
      pins,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalPins: total
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch access PINs.", details: error.message });
  }
};

// Fetch transaction ledger scoped to tenant
exports.getTransactions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (req.organizationId) query.organizationId = req.organizationId;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .populate('user', 'fullName email registrationNumber')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalTransactions: total
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transactions.", details: error.message });
  }
};

// Verify payment gateway transaction reference
exports.verifyPayment = async (req, res) => {
  try {
    const { reference, provider = 'paystack' } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "Transaction reference is required." });
    }

    let transaction = await Transaction.findOne({ reference });
    if (transaction && transaction.status === 'SUCCESSFUL') {
      return res.status(200).json({ message: "Transaction already verified.", transaction });
    }

    // Gateway verification check logic goes here
    const paymentVerified = true; 

    if (!paymentVerified) {
      return res.status(400).json({ error: "Payment verification failed with provider." });
    }

    transaction = await Transaction.findOneAndUpdate(
      { reference },
      {
        organizationId: req.organizationId,
        user: req.user.id,
        reference,
        status: 'SUCCESSFUL',
        provider
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      message: "Payment verified successfully.",
      transaction
    });
  } catch (error) {
    res.status(500).json({ error: "Payment verification error.", details: error.message });
  }
};