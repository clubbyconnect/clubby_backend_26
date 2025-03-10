const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReportSchema = new Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    details: {
        type: String,
        required: true,
    },
    reportedAt: {
        type: Date,
        default: Date.now,  // Automatically sets the timestamp when the report is created
    }
});

const Report = mongoose.model('Report', ReportSchema);
module.exports = Report;
