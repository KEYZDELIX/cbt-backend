const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
  dayOfWeek: { 
    type: String, 
    enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
    required: true 
  },
  startTime: { type: String, required: true }, // e.g., "16:00" (24hr format)
  endTime: { type: String, required: true },   // e.g., "18:00"
  subject: { type: String, required: true },   // e.g., "Mathematics", "Physics"
  venueOrLink: { type: String, default: "" }   // Physical classroom or Google Meet/Zoom link
}, { _id: false });

const CohortSchema = new mongoose.Schema({
  // ==========================================
  // 1. TENANCY & ACCESS CONTROL
  // ==========================================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, "Organization reference is required"],
    index: true
  },
  
  // ==========================================
  // 2. COHORT METADATA & CLASSIFICATION
  // ==========================================
  name: { 
    type: String, 
    required: [true, "Cohort name is required"], 
    trim: true 
  }, // e.g., "WAEC 2027 Intensive Revision Batch A"
  code: { 
    type: String, 
    required: true, 
    uppercase: true, 
    trim: true 
  }, // e.g., "SAVVY-WAEC-27A"
  description: { type: String, default: "" },
  
  targetExamType: { 
    type: String, 
    enum: ['JAMB', 'WAEC', 'NECO', 'CAMBRIDGE', 'JUPEB', 'IJMB', 'GENERAL_STEM', 'CUSTOM'],
    default: 'WAEC',
    index: true
  },
  subjectsCovered: [{ type: String }], // e.g., ["Mathematics", "Further Mathematics", "Physics"]

  // Delivery format
  deliveryMode: { 
    type: String, 
    enum: ['ONLINE', 'OFFLINE', 'HYBRID'], 
    default: 'ONLINE',
    index: true 
  },
  venueDetails: { type: String, default: "" }, // Physical center address or hall name
  onlineMeetingLink: { type: String, default: "" }, // Primary stream/webinar URL

  // ==========================================
  // 3. INSTRUCTORS & ENROLLMENT MANAGEMENT
  // ==========================================
  leadInstructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assistantInstructors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  maxCapacity: { type: Number, default: 100 },
  enrolledCandidateCount: { type: Number, default: 0 },
  
  // ==========================================
  // 4. TIMELINE, PRICING & STATUS
  // ==========================================
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  weeklySchedule: [ScheduleSchema],
  
  tuitionFee: { type: Number, default: 0 }, // 0 = Free public cohort
  currency: { type: String, default: 'NGN' },
  
  status: { 
    type: String, 
    enum: ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'], 
    default: 'UPCOMING',
    index: true 
  },
  
  // Linked resources (Mock exams tied to this cohort)
  linkedExams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamConfig'
  }],

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

// Combined index for fast lookup of active classes per school
CohortSchema.index({ organizationId: 1, status: 1, deliveryMode: 1 });
CohortSchema.index({ code: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model('Cohort', CohortSchema);