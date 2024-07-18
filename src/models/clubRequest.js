const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const clubRequestSchema = new Schema({
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
  
const clubRequest = mongoose.model('clubRequest', clubRequestSchema);

module.exports = clubRequest;
