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
  /** Users who left but keep read-only chat history in the app */
  leftMembers: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      leftAt: {
        type: Date,
        default: Date.now,
      },
      /** 1 = left once (may rejoin once); 2+ = hidden from home feed */
      leaveCount: {
        type: Number,
        default: 1,
      },
      rejoinedAt: {
        type: Date,
        default: null,
      },
      /** Audit trail: leave / rejoin cycles on this group (same groupId, not a new Group) */
      membershipHistory: [
        {
          event: {
            type: String,
            enum: ["left", "rejoined"],
            required: true,
          },
          at: {
            type: Date,
            default: Date.now,
          },
        },
      ],
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
  votes: [String],  // legacy — prefer wrapVotes
  /** Purchase bill for return policy; uploaded by group admin */
  dealBillUrl: { type: String, default: null },
  dealBillUploadedAt: { type: Date, default: null },
  dealBillUploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  /** Each active member must vote before the deal wraps */
  wrapVotes: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      votedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  /** Saved when admin votes; applied when all members have voted */
  pendingWrapReviews: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      rating: { type: Number, default: 0 },
    },
  ],
  messages: [{  // Add this field to store message IDs
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }]
}, {
  timestamps: true,
});

// Create a compound index for frequently queried combinations, if needed
GroupSchema.index({ adminId: 1, isActive: 1 });
GroupSchema.index({ "leftMembers.user": 1 });

// Prevent Overwrite
const Group = mongoose.models.Group || mongoose.model('Group', GroupSchema);
module.exports = Group;
