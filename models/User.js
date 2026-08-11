const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // ==========================================
  // 1. TENANT & ROLE MANAGEMENT
  // ==========================================
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, "Organization reference is required"],
    index: true // Key index for fast multi-tenant queries
  },
  role: {
    type: String,
    enum: [
      'SUPER_ADMIN', 
      'CUSTOMER_SERVICE',
      'ORG_ADMIN', 
      'ORG_FINANCE', 
      'EXAM_OFFICER', 
      'QUESTION_AUTHOR', 
      'INSTRUCTOR', 
      'PROCTOR', 
      'CANDIDATE', 
      'GUEST_USER'
    ],
    default: 'CANDIDATE',
    required: true,
    index: true
  },

  // ==========================================
  // 2. IDENTIFICATION
  // ==========================================
  firstName: { 
    type: String, 
    required: [true, "First name is required"], 
    trim: true 
  },
  middleName: { 
    type: String, 
    trim: true 
  },
  lastName: { 
    type: String, 
    required: [true, "Last name is required"], 
    trim: true 
  },
  gender: {
    type: String,
    enum: ['Male', 'Female'],
    required: [true, "Gender is required"]
  },
  regNo: { 
    type: String, 
    uppercase: true,
    trim: true,
    required: [true, "Registration number is required"]
  },

  // ==========================================
  // 3. CONTACT & AUTHENTICATION
  // ==========================================
  email: {
    type: String,
    lowercase: true,
    trim: true,
    sparse: true // Allows nulls while keeping unique constraints functional
  },
  phone: {
    type: String,
    trim: true
  },
  password: { 
    type: String, // Bcrypt Hash
    required: [true, "Password hash is required"] 
  },

  // ==========================================
  // 4. ACADEMIC & CANDIDATE PROFILE
  // ==========================================
  examType: { 
    type: String, 
    enum: ['JAMB', 'WAEC', 'NECO', 'CAMBRIDGE', 'CUSTOM'], 
    default: 'JAMB'
  },
  department: { 
    type: String, 
    enum: ['Science', 'Art', 'Commercial', 'General', 'N/A'],
    default: 'N/A' 
  },
  courseOfStudy: { type: String, default: 'N/A' },
  classLevel: { type: String, trim: true },
  subjectCombination: [{ type: String, trim: true }],
  // Profile Media
  passportUrl: {
    type: String,
    default: null, // Stores Cloudinary 
    trim: true
  },

  // ==========================================
  // 5. HOST-ONLY SERVICES (Tutoring & Offline)
  // ==========================================
  // Active only when organizationId points to the Host Organization
  hostServices: {
    isEnrolledOnlineTutoring: { type: Boolean, default: false },
    isEnrolledOfflineLessons: { type: Boolean, default: false },
    batchGroup: { type: String, default: null } // e.g., "Savvy-Morning-Cohort"
  },

  // ==========================================
  // 6. ACCOUNT STATE & SESSION
  // ==========================================
  status: {
    type: String,
    enum: [
      'PENDING_VERIFICATION', 
      'ACTIVE', 
      'PENDING_PAYMENT', 
      'PENDING_APPROVAL', 
      'SUSPENDED', 
      'GRADUATED', 
      'DEACTIVATED'
    ],
    default: 'PENDING_VERIFICATION',
    index: true
  },
  isLoggedIn: { 
    type: Boolean, 
    default: false 
  },
  lastLogin: { 
    type: Date,
    default: null
  }
}, { timestamps: true });

// ==========================================
// INDEXES & CONSTRAINTS
// ==========================================
// Ensure regNo is unique WITHIN the same organization (allows two different orgs to have a regNo "ST-001")
UserSchema.index({ organizationId: 1, regNo: 1 }, { unique: true });

// Optional: Keep phone index only if 'phone' does NOT have index: true or unique: true in its field definition
UserSchema.index({ phone: 1 });


module.exports = mongoose.model('User', UserSchema);