const mongoose = require('mongoose');
const User = require("../models/User.js");
const Post = require("../models/Post.js");


exports.addToFavourites = async (req, res) => {
    try {
        const userId = req.User._id;
        const { productId } = req.body;

        if (!userId || !productId) {
            return res.status(400).json({ message: "User ID and Product ID are required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if product is already in favourites
        const productIndex = user.favourites.indexOf(productId);

        if (productIndex !== -1) {
            // Remove product from favourites
            user.favourites.splice(productIndex, 1);
            await user.save();
            return res.status(200).json({ message: "Product removed from favourites", favourites: user.favourites });
        }

        // Add product to favourites
        user.favourites.push(productId);
        await user.save();

        res.status(200).json({ message: "Product added to favourites", favourites: user.favourites });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

exports.getFilteredFavoriteProducts = async (req, res) => {
    try {
        const userId = req.User._id;
        const { lat, lon, status, page = 1, limit = 10 } = req.query;

        // Validate latitude and longitude
        if (!lat || !lon) {
            return res.status(400).json({ success: false, message: "Latitude and longitude are required" });
        }

        const parsedLat = parseFloat(lat);
        const parsedLon = parseFloat(lon);

        if (isNaN(parsedLat) || isNaN(parsedLon)) {
            return res.status(400).json({ success: false, message: "Invalid latitude or longitude" });
        }

        // Validate status filter (if provided)
        const validStatuses = ["Active", "Inactive", "Full", "Pending", "Created"];
        let statusFilter = {};
        if (status && validStatuses.includes(status)) {
            statusFilter = { clubStatus: status };
        }

        // Fetch user to get their favorite products
        const user = await User.findById(userId).select("favourites").lean();
        console.log("User Favorites:", user.favourites);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (!user.favourites || user.favourites.length === 0) {
            return res.status(404).json({ success: false, message: "No favorite products found!" });
        }

        let aggregatePipeline = [];

        // GeoNear for distance calculation (within 200 KM)
        aggregatePipeline.push({
            $geoNear: {
                near: {
                    type: "Point",
                    coordinates: [parsedLon, parsedLat],
                },
                distanceField: "distance",
                spherical: true,
                maxDistance: 5000000,
                key: "store_location.coordinates",
            },
        });

        // Match user's favorite products, apply status filter, and filter by expiry date
        aggregatePipeline.push({
            $match: {
                _id: { $in: user.favourites.map(id => new mongoose.Types.ObjectId(id)) },
                deletedAt: null,
                expiryAt: { $gt: new Date() }, // Only include products whose expiry date is in the future
                ...statusFilter,
            },
        });

        // Lookup for category details
        aggregatePipeline.push(
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryDetails",
                },
            },
            {
                $unwind: {
                    path: "$categoryDetails",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: "subcategories",
                    localField: "subCategory",
                    foreignField: "_id",
                    as: "subCategoryDetails",
                },
            },
            {
                $unwind: {
                    path: "$subCategoryDetails",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: "groups",
                    let: { productId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$productId", "$$productId"] } } },
                    ],
                    as: "groupInfo",
                },
            },
            {
                $unwind: {
                    path: "$groupInfo",
                    preserveNullAndEmptyArrays: true,
                },
            }
        );

        // Project required fields
        aggregatePipeline.push({
            $project: {
                _id: 1,
                userId: 1,
                postOwnerId: 1,
                itemName: 1,
                clubMembers: 1,
                clubToJoin: {
                    $cond: {
                        if: { $isArray: "$groupInfo.members" },
                        then: { $subtract: ["$clubMembers", { $size: "$groupInfo.members" }] },
                        else: { $subtract: ["$clubMembers", 1] },
                    },
                },
                size: 1,
                productImage: 1,
                clubStatus: 1,
                categoryName: "$categoryDetails.name",
                categoryImage: "$categoryDetails.image",
                subCategoryName: "$subCategoryDetails.name",
                subCategoryImage: "$subCategoryDetails.image",
                expiryAt: 1, // Include expiry date in response
                distance: {
                    $cond: {
                        if: { $lt: ["$distance", 1] },
                        then: 0,
                        else: { $divide: ["$distance", 1000] }, // Convert meters to kilometers
                    },
                },
            },
        });

        // Pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Add pagination to aggregation
        const totalProducts = await Post.aggregate([...aggregatePipeline, { $count: "total" }]);
        const total = totalProducts.length > 0 ? totalProducts[0].total : 0;

        aggregatePipeline.push(
            { $skip: skip },
            { $limit: limitNum }
        );

        // console.log("Aggregation Pipeline:", JSON.stringify(aggregatePipeline, null, 2));
        const productsBeforeFilter = await Post.find({
            _id: { $in: user.favourites.map(id => new mongoose.Types.ObjectId(id)) }
        });
        console.log("Products Before Filtering:", productsBeforeFilter);
        const sampleProduct = await Post.findOne();
        console.log("Sample Product Location:", sampleProduct.store_location);


        const filteredFavoriteProducts = await Post.aggregate(aggregatePipeline);

        console.log("GeoNear Distance Check:", filteredFavoriteProducts.map(p => p.distance));


        if (filteredFavoriteProducts.length === 0) {
            return res.status(404).json({ success: false, message: "No favorite products found" });
        }

        res.status(200).json({
            success: true,
            data: filteredFavoriteProducts,
            pagination: {
                totalItems: total,
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                pageSize: limitNum,
            },
        });
    } catch (error) {
        console.error("Error fetching filtered favorite products:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};




