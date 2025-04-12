const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CallSchema = new Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true,
        unique: true, // Ensure only one active call per group
    },
    type: {
        type: String,
        enum: ['video', 'audio'],
        required: true,
    },
    participants: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    ],
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Call = mongoose.model('Call', CallSchema);
module.exports = Call;
