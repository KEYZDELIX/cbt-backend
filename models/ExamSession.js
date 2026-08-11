const mongoose = require('mongoose');

const examSessionSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    accessPin: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'COMPLETED', 'TERMINATED', 'TIMED_OUT'],
      default: 'IN_PROGRESS'
    },
    responses: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true
        },
        selectedOption: {
          type: String,
          default: null
        },
        isMarkedForReview: {
          type: Boolean,
          default: false
        }
      }
    ],
    score: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    tabSwitchCount: {
      type: Number,
      default: 0
    },
    proctorLogs: [
      {
        eventType: {
          type: String,
          enum: ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'LOST_FOCUS', 'FORCE_SUBMIT'],
          required: true
        },
        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ],
    startedAt: {
      type: Date,
      default: Date.now
    },
    submittedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExamSession', examSessionSchema);