const User = require("../models/User"); // Adjust the path accordingly

/**
 * @param {String} userId - The ID of the user to check.
 * @returns {Promise<{status: Boolean, fcmToken?: String}>} - Returns an object with status and fcmToken if true.
 */
const checkUserFCMAndDevice = async (userId) => {
    try {
        const user = await User.findById(userId, "fcmToken deviceType");

        if (!user || !user.fcmToken || !user.deviceType) {
            return { status: false };
        }

        return { status: true, fcmToken: user.fcmToken };
    } catch (error) {
        console.error("Error checking user FCM and device type:", error);
        return { status: false };
    }
};

module.exports = checkUserFCMAndDevice;
