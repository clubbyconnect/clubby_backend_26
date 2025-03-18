const User = require("../models/User"); // Adjust the path accordingly

/**
 * @param {String} userId - The ID of the user to check.
 * @returns {Promise<Boolean>} - Returns true if both fcmToken and deviceType exist, otherwise false.
 */
const checkUserFCMAndDevice = async (userId) => {
    try {
        const user = await User.findById(userId, "fcmToken deviceType");

        if (!user) return false;

        return Boolean(user.fcmToken && user.deviceType);
    } catch (error) {
        console.error("Error checking user FCM and device type:", error);
        return false;
    }
};

module.exports = checkUserFCMAndDevice;
