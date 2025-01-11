exports.searchByProductName = async (req, res) => {
    try {
        const { productName, lon, lat } = req.query;

        if (!productName) {
            return res.status(400).json({ message: "Product name is required" });
        }

        if (!lon || !lat) {
            return res.status(400).json({ message: "Longitude and latitude are required" });
        }

        const products = await post.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [parseFloat(lon), parseFloat(lat)],
                    },
                    distanceField: "distance",
                    spherical: true,
                    maxDistance: 5000000,
                    key: "store_location.coordinates",
                },
            },
            {
                $match: {
                    itemName: { $regex: productName, $options: "i" },
                },
            },
            {
                $project: {
                    _id: 1,
                    userId: 1,
                    clubType: 1,
                    category: 1,
                    subCategory: 1,
                    itemName: 1,
                    offerType: 1,
                    price: 1,
                    price_type: 1,
                    clubMembers: 1,
                    additionalInformation: 1,
                    size: 1,
                    itemLink: 1,
                    platform: 1,
                    paymentMode: 1,
                    productImage: 1,
                    clubStatus: 1,
                    reportCount: 1,
                    reportedBy: 1,
                    reportMessage: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    __v: 1,
                    store_location: 1,
                    delivery_location: 1,
                    distance: {
                        $cond: {
                            if: { $lt: ["$distance", 1] },
                            then: 0,
                            else: { $divide: ["$distance", 1000] },
                        },
                    },
                },
            },
        ]);

        if (products.length === 0) {
            return res.status(404).json({ message: "No products found" });
        }

        res.status(200).json({
            success: true,
            data: products.map((product) => ({
                ...product,
                distance: product.distance,
            })),
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};

exports.searchByDistance = async (req, res) => {
    try {
        const { latitude, longitude, radius } = req.query;

        if (!latitude || !longitude || !radius) {
            return res.status(400).json({
                success: false,
                message: "Latitude, longitude, radius,  are required.",
            });
        }
        console.log('latitude, longitude, radius ', latitude, longitude, radius)

        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        const kmRadius = parseFloat(radius);

        if (isNaN(lat) || isNaN(lon) || isNaN(kmRadius) || kmRadius <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude, longitude, or radius.",
            });
        }

        const radiusInMeters = kmRadius * 1000;



        const locationKey = 'store_location';

        const geoQuery = {
            [`${locationKey}.coordinates`]: {
                $nearSphere: {
                    $geometry: {
                        type: "Point",
                        coordinates: [lon, lat],
                    },
                    $maxDistance: radiusInMeters,
                }
            }
        };


        const results = await post.find(geoQuery);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No posts found within the specified radius.",
            });
        }

        res.status(200).json({
            success: true,
            data: results,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};


exports.searchByGender = async (req, res) => {
    try {
        const { gender } = req.query;

        if (!gender) {
            return res.status(400).json({ message: "Gender is required" });
        }

        const products = await post.find();

        const filteredProducts = [];
        for (const product of products) {
            const user = await User.findById(product.userId);

            if (user && user.gender.toLowerCase() === gender.toLowerCase()) {
                filteredProducts.push(product);
            }
        }

        if (filteredProducts.length === 0) {
            return res.status(404).json({ message: "No products found for the specified gender" });
        }

        res.status(200).json({ products: filteredProducts });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};
exports.searchByDate = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Date is required",
            });
        }

        const startDate = new Date(date);
        console.log('START DATE I S', startDate)

        if (isNaN(startDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format",
            });
        }

        const results = await post.find({
            createdAt: { $gte: startDate },
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: results,
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};
exports.searchByFilter = async (req, res) => {
    try {
        const { offerType, clubMembers, size } = req.query;

        let filter = {};

        // Only add the offerType to the filter if it's not 'Any'
        if (offerType && offerType !== 'Any') {
            filter.offerType = offerType;
        }

        if (clubMembers) {
            filter.clubMembers = parseInt(clubMembers);
        }

        if (size) {
            filter.size = size;
        }

        const results = await post.find(filter);

        res.status(200).json({
            success: true,
            data: results,
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};

exports.searchBySort = async (req, res) => {
    try {
        const { sortBy } = req.query;

        let sortOptions = {};
        if (sortBy === "price_high_to_low") {
            sortOptions.price = -1;
        } else if (sortBy === "price_low_to_high") {
            sortOptions.price = 1;
        } else if (sortBy === "newest") {
            sortOptions.createdAt = -1;
        }

        const results = await post.find().sort(sortOptions);

        res.status(200).json({
            success: true,
            data: results,
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};