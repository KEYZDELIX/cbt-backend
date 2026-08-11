const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  // ==========================================
  // 1. TENANCY & USER IDENTIFICATION
  // ==========================================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, "Organization reference is required"],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "User reference is required"],
    index: true
  },

  // ==========================================
  // 2. TRANSACTION TYPE & PURPOSE
  // ==========================================
  purpose: {
    type: String,
    enum: [
      'EXAM_REGISTRATION',    // Candidate paying for an exam/mock registration
      'TUTORING_SUBSCRIPTION', // Candidate paying for online/offline tutoring cohort
      'ORGANIZATION_TOPUP',   // Partner school purchasing CBT candidate seats/credits
      'PRACTICE_QUIZ_ACCESS', // Individual quiz/item bank access
      'OTHER'
    ],
    required: true,
    index: true
  },

  // Optional references depending on what is being paid for
  relatedExamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamConfig',
    default: null
  },
  relatedCohortId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cohort', // Reference to online/offline tutoring schema
    default: null
  },

  // ==========================================
  // 3. FINANCIAL DETAILS & REVENUE SPLIT
  // ==========================================
  amount: {
    type: Number,
    required: [true, "Transaction amount is required"],
    min: [0, "Amount cannot be negative"]
  },
  currency: {
    type: String,
    enum: ['NGN', 'USD', 'GBP'],
    default: 'NGN'
  },
  
  // Platform financial breakdown (for partner org split settlement)
  platformFee: { 
    type: Number, 
    default: 0 
  }, // Host commission
  hostSettlementAmount: { 
    type: Number, 
    default: 0 
  }, // Net payout owed to host/partner

  // ==========================================
  // 4. PAYMENT GATEWAY METADATA (Paystack/Flutterwave)
  // ==========================================
  paymentProvider: {
    type: String,
    enum: ['PAYSTACK', 'FLUTTERWAVE', 'BANK_TRANSFER', 'MANUAL_OFFLINE', 'WALLET'],
    default: 'PAYSTACK'
  },
  reference: {
    type: String,
    required: true,
    unique: true, // Prevents duplicate payment processing
    index: true
  },
  channel: {
    type: String,
    default: 'card' // e.g., 'card', 'bank', 'ussd', 'qr'
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'ABANDONED'],
    default: 'PENDING',
    index: true
  },
  paidAt: {
    type: Date,
    default: null
  },
  
  // Raw gateway response stored for auditing/debugging webhooks
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // ==========================================
  // 5. METADATA & AUDITING
  // ==========================================
  description: {
    type: String,
    default: ""
  },
  metadata: {
    type: Map,
    of: String,
    default: {} // Flexible custom key-value pairs (e.g. candidate regNo, referral code)
  }
}, { timestamps: true });

// ==========================================
// INDEXES FOR FINANCIAL REPORTING
// ==========================================
TransactionSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, purpose: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);