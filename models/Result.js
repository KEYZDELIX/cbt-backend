const mongoose = require('mongoose');

const ResultSchema = new mongoose.Schema({
  name: String,
  score: Number,
  total: Number,
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', ResultSchema);
