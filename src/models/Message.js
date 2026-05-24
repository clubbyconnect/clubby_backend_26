// src/models/Message.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true // Index for fast retrieval of messages by groupId
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return this.type !== 'system';  // Only require senderId for non-system messages
    },
    index: true // Index for fast retrieval of messages by senderId
  },
  content: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'system', 'voiceCall', 'videoCall'], // Removed duplicate 'system'
    default: 'text',
    index: true // Index for fast retrieval of messages by type
  },
  mediaUrl: String,  // For storing media (image, video, voice)
  readBy: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      readAt: Date,
    },
  ],
}, {
  timestamps: true,
});

MessageSchema.index({ groupId: 1, senderId: 1 });
MessageSchema.index({ groupId: 1, createdAt: -1 });

const Message = mongoose.model('Message', MessageSchema);
module.exports = Message;
