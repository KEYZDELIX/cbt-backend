const mongoose = require('mongoose');

const accessPinSchema = new mongoose.Schema(
  {
    pinCode: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true
    },
    batchName: {
      type: String,
      default: 'General Batch'
    },
    isUsed: {
      type: Boolean,
      default: false
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    usedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AccessPin', accessPinSchema);