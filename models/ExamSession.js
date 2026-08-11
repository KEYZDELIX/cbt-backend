const mongoose = require('mongoose');

const examSessionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization reference is required'],
      index: true
    },
    examConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamConfig',
      required: [true, 'ExamConfig reference is required'],
      index: true
    },
    sessionName: {
      type: String,
      required: true,
      trim: true // e.g., "2026 SS3 Term 1 Mock - Batch A"
    },
    accessPin: {
      type: String,
      default: null, // Optional PIN required to enter exam
      trim: true
    },
    
    // Scheduling Window
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },

    // Student Assignments (Allocation)
    assignmentType: {
      type: String,
      enum: ['ALL_STUDENTS', 'CLASS_LEVEL', 'CUSTOM_LIST'],
      default: 'ALL_STUDENTS'
    },
    assignedStudents: [{ type: String, trim: true }], // Stores RegNos or User ObjectIds

    // Status
    status: {
      type: String,
      enum: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

examSessionSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('ExamSession', examSessionSchema);