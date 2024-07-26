const mongoose = require("mongoose");

const clubRequestSchema = new mongoose.Schema({
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'post', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  },{timestamps: true,}
);
  
const ClubRequest = mongoose.model('ClubRequest', clubRequestSchema);
module.exports = ClubRequest;
