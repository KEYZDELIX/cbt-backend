const mongoose = require('mongoose');

const ExamAllocationSchema = new mongoose.Schema({
  // ==========================================
  // 1. TENANT & ENTITY REFERENCES
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
    required: [true, "Candidate reference is required"],
    index: true
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam', // Or 'Quiz' depending on your model name
    required: [true, "Exam reference is required"],
    index: true
  },

  // ==========================================
  // 2. SCHEDULING & BATCH MANAGEMENT
  // ==========================================
  batchNumber: {
    type: Number,
    default: 1,
    index: true // Helps center supervisors query candidates by batch
  },
  venue: {
    type: String,
    trim: true,
    default: 'Online' // e.g., "Hall A", "Computer Lab 2", or "Online Portal"
  },
  seatNumber: {
    type: String,
    trim: true,
    default: null
  },
  startTime: {
    type: Date,
    required: [true, "Allocation start time is required"]
  },
  endTime: {
    type: Date,
    required: [true, "Allocation end time is required"]
  },

  // ==========================================
  // 3. SECURITY & ATTEMPT CONTROL
  // ==========================================
  // Ensures candidate gets a reproducible, randomized question/option order unique to them
  shuffleSeed: {
    type: String,
    required: true,
    default: () => Math.random().toString(36).substring(2, 10) // Random alphanumeric string
  },
  // Unique access PIN / passcode for invigilators to unlock this candidate's screen
  accessPin: {
    type: String,
    trim: true,
    default: null
  },
  maxAttempts: {
    type: Number,
    default: 1
  },
  attemptsCount: {
    type: Number,
    default: 0
  },

  // ==========================================
  // 4. ATTEMPT STATUS & PROGRESS
  // ==========================================
  status: {
    type: String,
    enum: [
      'PENDING',      // Allocated, waiting for schedule window
      'READY',        // Cleared by invigilator/system to start
      'IN_PROGRESS',  // Candidate currently taking the test
      'COMPLETED',    // Test finished and submitted
      'EXPIRED',      // Time elapsed without candidate attempting
      'DISQUALIFIED'  // Suspended during exam (e.g., malpractice)
    ],
    default: 'PENDING',
    index: true
  },
  
  // Link to the actual attempt session data/results when started
  activeAttemptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamAttempt',
    default: null
  }

}, { 
  timestamps: true 
});

// ==========================================
// INDEXES & CONSTRAINTS
// ==========================================

// Prevents duplicate allocations of the same exam to a student unless explicit attempts are re-granted
ExamAllocationSchema.index({ userId: 1, examId: 1 }, { unique: true });

// Compound index for fast querying by invigilators at test centers
ExamAllocationSchema.index({ organizationId: 1, batchNumber: 1, status: 1 });

module.exports = mongoose.model('ExamAllocation', ExamAllocationSchema);