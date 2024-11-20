const mongoose = require('mongoose');

const votingSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  votes: {
    type: Map,
    of: String, // Stores 'yes' or 'no' for each member
  },
  status: {
    type: String,
    enum: ["ongoing", "completed", "denied"],
    default: "ongoing",
  },
});

const Voting = mongoose.model('Voting', votingSchema);
module.exports = Voting;
