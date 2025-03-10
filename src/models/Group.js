// src/models/Group.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GroupSchema = new Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,  // Change to ObjectId for reference to Product
    ref: 'Post',  // Reference to the Product model
    required: true,
    index: true 
  },
  productName: {
    type: String,
    required: true,
    index: true  // Index for fast retrieval by productName
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true  // Index for fast retrieval of groups by adminId
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true  // Index for fast querying of groups by member ID
    },
  ],
  limit: {
    type: Number,
    required: true,
    default: 10,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true  // Index for filtering active groups
  },
  votes: [String],  // Used for voting logic (e.g., 'yes', 'no')
  messages: [{  // Add this field to store message IDs
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }]
}, {
  timestamps: true,
});

// Create a compound index for frequently queried combinations, if needed
GroupSchema.index({ adminId: 1, isActive: 1 });

// Prevent Overwrite
const Group = mongoose.models.Group || mongoose.model('Group', GroupSchema);
module.exports = Group;
