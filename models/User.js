const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
  // Identification
  firstName: { 
    type: String, 
    required: [true, "First name is required"], 
    trim: true 
  },
  lastName: { 
    type: String, 
    required: [true, "Last name is required"], 
    trim: true 
  },
  regNumber: { 
    type: String, 
    unique: true, 
    uppercase: true,
    required: true
    // Example format: 20241234AB
  },


  // Academic Profile
  subjectCombination: {
    type: [String],
    validate: [arrayLimit, '{PATH} must have exactly 4 subjects']
  },

  // Security & Session Management
  password: { 
    type: String, 
    required: true // Even for mocks, you need a PIN or Password
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
});

// Validator to ensure exactly 4 subjects (JAMB Standard)
function arrayLimit(val) {
  return val.length === 4;
}

module.exports = mongoose.model('User', UserSchema);
