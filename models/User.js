const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: String,
  subjects: [String], // e.g. ["Mathematics", "Physics", "Chemistry", "Biology"]
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
