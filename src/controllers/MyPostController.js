const mongoose = require('mongoose');
const Group = require('../models/Group.js');
const Post = require("../models/Post");
const checkUserFCMAndDevice = require("../utils/FcmCheck.js")
const admin = require("../utils/Firebase.js")
const { addNotification } = require("./NotificationController.js");


exports.getUserPosts = async (req, res) => {
    try {

        const userId = req.User._id;
        const { lon, lat, status, page = 1, limit = 10 } = req.query;

        const result = await checkUserFCMAndDevice(userId);

        if (result.status) {
            console.log("User has FCM Token:", result.fcmToken);

            let message = {
                token: result.fcmToken,
                notification: {
                    title: 'Bored Out of Your Mind? 🤨',
                    body: 'Someone wants to spice up your product group! Check it out! 🌟'
                }
            };

            admin.messaging().send(message)
                .then(response => {
                    console.log('Successfully sent message:', response);
                })
                .catch(error => {
                    console.error('Error sending message:', error);
                });

        } else {
            console.log("User does not have a valid FCM Token or Device Type.");
        }

        //add notification 
        const success = addNotification("Bored Out of Your Mind? 🤨", "Someone wants to spice up your product group! Check it out! 🌟", userId, "JoinReq", `clubby://product/12345`, '6706ee5800ff26da8e2be0dc', "Group");
        if (success) {
            console.log('Add notification to controller')
        }
        else {
            console.log('Error adding notification to controller')
        }


        if (!lat || !lon) {
            return res.status(400).json({ success: false, message: "Latitude and longitude are required" });
        }

        const parsedLat = parseFloat(lat);
        const parsedLon = parseFloat(lon);
        const parsedPage = parseInt(page, 10);
        const parsedLimit = parseInt(limit, 10);

        if (isNaN(parsedLat) || isNaN(parsedLon) || isNaN(parsedPage) || isNaN(parsedLimit)) {
            return res.status(400).json({ success: false, message: "Invalid parameters" });
        }

        const userIdObjectId = new mongoose.Types.ObjectId(userId);

        let aggregatePipeline = [
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [parsedLon, parsedLat] },
                    distanceField: "distance",
                    spherical: true,
                    maxDistance: 4500000000,
                    key: "store_location.coordinates",
                },
            },
            {
                $match: {
                    userId: userIdObjectId,
                    expiryAt: { $gt: new Date() }
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryDetails",
                },
            },
            { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "subcategories",
                    localField: "subCategory",
                    foreignField: "_id",
                    as: "subCategoryDetails",
                },
            },
            { $unwind: { path: "$subCategoryDetails", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "groups",
                    let: { productId: { $toString: "$_id" } },
                    pipeline: [{ $match: { $expr: { $eq: ["$productId", "$$productId"] } } }],
                    as: "groupInfo",
                },
            },
            { $unwind: { path: "$groupInfo", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    userId: 1,
                    postOwnerId: 1,
                    itemName: 1,
                    postStatus: 1,
                    price: 1,
                    price_type: 1,
                    productImage: 1,
                    categoryName: "$categoryDetails.name",
                    categoryImage: "$categoryDetails.image",
                    subCategoryName: "$subCategoryDetails.name",
                    subCategoryImage: "$subCategoryDetails.image",
                    distance: {
                        $cond: {
                            if: { $lt: ["$distance", 1] },
                            then: 0,
                            else: { $divide: ["$distance", 1000] },
                        },
                    },
                    groupInfo: 1,
                    size: 1,
                    itemLink: 1,
                    platform: 1,
                    additionalInformation: 1,
                    clubStatus: 1,
                    clubMembers: 1,
                    clubToJoin: {
                        $cond: {
                            if: { $isArray: "$groupInfo.members" },
                            then: { $subtract: ["$clubMembers", { $size: "$groupInfo.members" }] },
                            else: { $subtract: ["$clubMembers", 1] },
                        },
                    },
                },
            },
            { $skip: (parsedPage - 1) * parsedLimit },
            { $limit: parsedLimit }
        ];

        const totalPosts = await Post.countDocuments({ userId: userIdObjectId, expiryAt: { $gt: new Date() } });
        const posts = await Post.aggregate(aggregatePipeline);

        if (posts.length === 0) {
            return res.status(404).json({ success: false, message: "No posts found" });
        }

        const modifiedPosts = await Promise.all(
            posts.map(async (post) => {
                let postStatus = post.postStatus;

                if (post.postOwnerId && post.postOwnerId.toString() === userId.toString()) {
                    postStatus = "I created";
                } else {
                    const groups = await Group.find({ members: userId, productId: post.productId });
                    const isMember = groups.some(group => group.members.includes(userId));

                    if (isMember) {
                        postStatus = "I joined";
                    }
                }

                return {
                    _id: post._id,
                    itemName: post.itemName,
                    postStatus,
                    distance: post.distance,
                    categoryName: post.categoryName,
                    categoryImage: post.categoryImage,
                    subCategoryName: post.subCategoryName,
                    subCategoryImage: post.subCategoryImage,
                    groupInfo: post.groupInfo,
                    size: post.size,
                    itemLink: post.itemLink,
                    platform: post.platform,
                    delivery_location: post.delivery_location,
                    store_location: post.store_location,
                    additionalInformation: post.additionalInformation,
                    clubMembers: post.clubMembers,
                    clubToJoin: post.clubToJoin,
                    productImage: post.productImage,
                    status: post.clubStatus,
                };
            })
        );

        let filteredPosts = modifiedPosts;
        if (status) {
            if (status === "I created") {
                filteredPosts = modifiedPosts.filter(post => post.postStatus === "I created");
            } else if (status === "I joined") {
                filteredPosts = modifiedPosts.filter(post => post.postStatus === "I joined");
            } else if (status === "Active" || status === "Inactive" || status === "WrapDeal") {
                filteredPosts = modifiedPosts.filter(post => post.status === status);
            } else if (status === "Full") {
                filteredPosts = modifiedPosts.filter(post => post.clubToJoin === 0);
            }
        }

        res.status(200).json({
            success: true,
            message: "Posts fetched successfully within 200 KM",
            posts: filteredPosts,
            totalPages: Math.ceil(totalPosts / parsedLimit),
            currentPage: parsedPage,
        });
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
