const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Can be group or person name
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false }, // Read status (Hard Read)
    isSoftRead: { type: Boolean, default: false }, // Soft Read status (Panel Opened)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Associated user
    notificationType: {
        type: String,
        enum: ["Message", "JoinReq", "AccptReq","DecReq"],
        required: true
    }, // Notification type
    deeplink: { type: String, default: null }, // Actionable link
    refId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Reference ID for Product or Group
    refType: { type: String, enum: ["Product", "Group"], required: true }, // Type of reference (Product or Group)
    customData: { type: mongoose.Schema.Types.Mixed, default: {} }, // Custom JSON data
});

// Soft Read Count: Tracks number of unread notifications
NotificationSchema.statics.getUnreadCount = async function (userId) {
    return await this.countDocuments({ userId, isRead: false });
};

module.exports = mongoose.model('Notification', NotificationSchema);
