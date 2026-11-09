const Notification = require('../models/Notification');
const Product = require('../models/Post'); // Assuming Product model exists
const Group = require('../models/Group'); // Assuming Group model exists

const addNotification = async (name, message, userId, notificationType, deeplink, refId, refType, customData) => {
    try {
        // Validate required fields
        if (!name || !message || !userId || !notificationType || !refId || !refType) {
            throw new Error("Missing required fields");
        }

        // Validate reference type and ID existence
        if (refType === "Product") {
            const product = await Product.findById(refId);
            if (!product) throw new Error("Product not found");
        } else if (refType === "Group") {
            const group = await Group.findById(refId);
            if (!group) throw new Error("Group not found");
        }

        // Create notification
        const notification = new Notification({ name, message, userId, notificationType, deeplink, refId, refType, customData });
        await notification.save();

        return true; // Success
    } catch (error) {
        console.error("Error adding notification:", error.message);
        return false; // Failure
    }
};


const getNotifications = async (req, res) => {
    try {
        const userId = req.User._id;

        // Fetch notifications sorted by creation date
        const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });

        // Mark all notifications as soft read
        await Notification.updateMany({ userId, isSoftRead: false }, { $set: { isSoftRead: true } });

        // Process notifications to fetch images
        const updatedNotifications = await Promise.all(
            notifications.map(async (notification) => {
                let image = null;
                let prodName = null;
                if (notification.refType === "Product") {
                    const product = await Product.findById(notification.refId);
                    if (product) {
                        image = product.productImage;
                        prodName = product.itemName;
                    }
                } else if (notification.refType === "Group") {
                    const group = await Group.findById(notification.refId);
                    if (group) {
                        prodName =
                            group.productName?.trim() ||
                            null;
                        const product = await Product.findById(group.productId);
                        if (product) {
                            image = product.productImage;
                            prodName =
                                product.itemName?.trim() ||
                                prodName ||
                                group.productName?.trim() ||
                                null;
                        }
                    }
                }
                return { ...notification._doc, image, prodName };
            })
        );

        res.status(200).json(updatedNotifications);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



const getUnreadCount = async (req, res) => {
    try {
        const userId = req.User._id;

        const unreadCount = await Notification.countDocuments({ userId, isSoftRead: false });

        res.status(200).json({ unreadCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const readOneNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        notification.isRead = true;
        await notification.save();

        res.status(200).json({ message: "Notification marked as read" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


module.exports = { addNotification, getNotifications, getUnreadCount, readOneNotification };
