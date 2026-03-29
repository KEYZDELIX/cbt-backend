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
    enum: ['Male', 'Female'], // Keeps data clean for school records
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
    // Optional: add a regex validator if you want to strictly enforce email format
  },
  phone: {
    type: String,
    trim: true
  },
  courseOfStudy: {
    type: String,
    trim: true,
    placeholder: "e.g., Engineering, Medicine, Science"
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
    type: String, 
    required: true 
  },
  role: {
    type: String,
    default: 'student'
  },
  isLoggedIn: { 
    type: Boolean, 
    default: false 
  },
  lastLogin: { 
    type: Date 
  },
  
  // Meta
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true }); // Automatically adds 'updatedAt' for you

// Validator to ensure exactly 4 subjects (JAMB Standard)
function arrayLimit(val) {
  // We only validate if subjects are actually provided
  if (!val || val.length === 0) return true; 
  return val.length === 4;
}

module.exports = mongoose.model('User', UserSchema);