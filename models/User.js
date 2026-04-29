const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // Identification
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
    unique: true, 
    uppercase: true,
    required: [true, "Registration number is required"]
  },

  // Contact & Profile
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  courseOfStudy: {
    type: String,
    trim: true
  },

  // Academic Profile
  classLevel: {
    type: String,
    enum: ['SS1', 'SS2', 'SS3'],
    required: true
  },
  subjectCombination: {
    type: [String],
    validate: [arrayLimit, '{PATH} must have exactly 4 subjects']
  },

  // Security & Session Management
  password: { 
    type: String, // This will store the BCRYPT HASH
    required: true 
  },
  plainPassword: { 
    type: String, // This stores the readable PIN (e.g., "A1B2C3")
    required: true 
  },
  role: {
    type: String,
    default: 'student'
  },
  examAllocations: [{
    examId: {type: mongoose.Schema.Types.ObjectId, ref: 'exam'},
    title: String,
    batchNumber: Number,
    shuffleSeed: String,
    startTime: Date,
    endTime: Date,
    hasTaken: { type: Boolean, default: false }
  }],
  isLoggedIn: { 
    type: Boolean, 
    default: false 
  },
  lastLogin: { 
    type: Date,
    default: null
  }
  
  // NOTE: createdAt and updatedAt are handled by the { timestamps: true } below
}, { timestamps: true }); 

// Validator for JAMB Standard
function arrayLimit(val) {
  if (!val || val.length === 0) return true; 
  return val.length === 4;
}

module.exports = mongoose.model('User', UserSchema);