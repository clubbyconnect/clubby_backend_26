const serverErrorHandler = require("../utils/serverErrorHandler.js");
const User = require("../models/user.js");
const CategoryModel = require("../models/categorySchema.js");
const OfflineCategoryModel = require("../models/offlineCategorySchema.js");
const onlineCategoryModel = require("../models/onlineCategorySchema.js")
const post = require("../models/post.js");
const admin = require('firebase-admin');
const mongoose = require('mongoose');


//Firebase-setup
const serviceAccount = {
  type: process.env.type,
  project_id: process.env.project_id,
  private_key_id: process.env.private_key_id,
  private_key: process.env.private_key,
  client_email: process.env.client_email,
  client_id: process.env.client_id,
  auth_uri: process.env.auth_uri,
  token_uri: process.env.token_uri,
  auth_provider_x509_cert_url: process.env.auth_provider_x509_cert_url,
  client_x509_cert_url: process.env.client_x509_cert_url,
  universe_domain: process.env.universe_domain
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// controllers-----------------------------------
exports.sendPushNotification = async (req, res) => {
  const { token, message, title } = req.body;
  try {
    const payload = {
      notification: {
        title,
        body: message,
      },
    };

    admin.messaging().sendToDevice(token, payload)
      .then(response => {
        return res.status(200).json({ message: "Successfully sent message", data: response });
      })
      .catch(error => {
        return res.status(404).json({ error: "Error sending message" });
      });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};
exports.fetchallcategory = async (req, res) => {
  try {
    const allcategory = await CategoryModel.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "subcategories",
          foreignField: "_id",
          as: "subcategoriesData",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "subcategories",
          as: "parentCategories",
        },
      },
      {
        $match: {
          parentCategories: { $size: 0 },
        },
      },
      {
        $project: {
          name: 1,
          image: 1,
          subcategoriesData: {
            name: 1,
          },
        },
      },
    ]);

    if (allcategory && allcategory.length > 0) {
      const categoryData = allcategory.map((category) => ({
        name: category.name,
        image: category.image,
        subcategories: category.subcategoriesData.map((sub) => ({
          name: sub.name,
        })),
      }));


      return res.status(200).json({
        message: "Categories fetched successfully",
        data: categoryData,
      });

    } else {
      return res.status(404).json({ error: "Categories found" });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

//new
exports.fetchOnlinecategory = async (req, res) => {
  try {
    const allcategory = await onlineCategoryModel.aggregate([
      {
        $lookup: {
          from: "onlinecategories",
          localField: "onlineSubcategories",
          foreignField: "_id",
          as: "subcategoriesData",
        },
      },
      {
        $lookup: {
          from: "onlinecategories",
          localField: "_id",
          foreignField: "onlineSubcategories",
          as: "parentCategories",
        },
      },
      {
        $match: {
          parentCategories: { $size: 0 },
        },
      },
      {
        $project: {
          name: 1,
          image: 1,
          subcategoriesData: {
            name: 1,
          },
        },
      },
    ]);

    if (allcategory && allcategory.length > 0) {
      const categoryData = allcategory.map((category) => ({
        name: category.name,
        image: category.image,
        subcategories: category.subcategoriesData.map((sub) => ({
          name: sub.name,
        })),
      }));


      return res.status(200).json({
        message: "Categories fetched successfully",
        data: categoryData,
      });

    } else {
      return res.status(404).json({ error: "Categories found" });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};
exports.fetchsubcategory = async (req, res) => {
  try {
    const { parentCategoryName } = req.body;

    const subcategories = await CategoryModel.aggregate([
      {
        $match: {
          name: parentCategoryName,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "subcategories",
          foreignField: "_id",
          as: "subcategories",
        },
      },
      {
        $unwind: "$subcategories",
      },
      {
        $project: {
          _id: 0,
          name: "$subcategories.name",
        },
      },
    ]);

    if (subcategories && subcategories.length > 0) {
      const subcategoryNames = subcategories.map((category) => category.name);
      return res
        .status(200)
        .json({
          message: "Subcategories fetched successfully",
          data: subcategoryNames,
        });
    } else {
      return res
        .status(404)
        .json({
          error: "No subcategories found for the parent category name",
        });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.fetchOfflinecategory = async (req, res) => {
  try {

    const allcategory = await OfflineCategoryModel.aggregate([
      {
        $lookup: {
          from: "offlinecategories",
          localField: "offlineSubcategories",
          foreignField: "_id",
          as: "offlineSubcategoriesData",
        },
      },
      {
        $match: {
          "offlineSubcategoriesData.0": { $exists: true },
        },
      },
      {
        $project: {
          _id: 0,
          name: 1,
          type: 1,
          image: 1,
          offlineSubcategoriesData: {
            name: 1,
          },
        },
      },
    ]);

    if (allcategory && allcategory.length > 0) {
      const categoryData = allcategory.map((category) => ({
        name: category.name,
        image: category.image,
        type: category.type,
        offlineSubcategories: category.offlineSubcategoriesData.map((sub) => ({
          name: sub.name,
        })),
      }));

      return res.status(200).json({
        message: "Categories fetched successfully",
        data: categoryData,
      });
    } else {
      return res.status(404).json({ error: "No categories found" });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

// exports.fetchOfflinecategory = async (req, res) => {
//   try {
//     const allcategory = await OfflineCategoryModel.aggregate([
//       {
//         $lookup: {
//           from: "offlinecategories", 
//           localField: "offlineSubcategories", 
//           foreignField: "_id", 
//           as: "offlineSubcategoriesData",  
//         },
//       },
//       {
//         $match: {
//           "offlineSubcategoriesData.0": { $exists: true },  
//         },
//       },
//       {
//         $project: {
//           _id: 0,  
//           name: 1,
//           image: 1,
//           offlineSubcategoriesData: {  
//             name: 1,  
//           },
//         },
//       },
//     ]);


//     if (allcategory && allcategory.length > 0) {
//       const categoryData = allcategory.map((category) => ({
//         name: category.name,
//         image: category.image,
//         offlineSubcategories: category.offlineSubcategoriesData.map((sub) => ({
//           name: sub.name,  
//         })),
//       }));

//       return res.status(200).json({
//         message: "Categories fetched successfully",
//         data: categoryData,
//       });
//     } else {
//       return res.status(404).json({ error: "No categories found" });  
//     }
//   } catch (error) {
//     serverErrorHandler(error, res);  
//   }
// };

//serching APi's
exports.getAllProducts = async (req, res) => {
  try {
    const products = await post.find(); // Get all products

    if (products.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    res.status(200).json({ products });
  } catch (error) {
    serverErrorHandler(error, res); // Handle server errors
  }
};

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


exports.searchProducts = async (req, res) => {
  try {
    const {
      productName,
      lon,
      lat,
      gender,
      date,
      offerType,
      clubMembers,
      size,
      sortBy,
      rangeLat,
      rangeLon,
      rangeRadius,
      category,
      subCategory,
    } = req.query;

    let matchStage = {};
    let aggregatePipeline = [];

    if (rangeLat && rangeLon && rangeRadius) {
      const lat = parseFloat(rangeLat);
      const lon = parseFloat(rangeLon);
      const kmRadius = parseFloat(rangeRadius);

      if (!isNaN(lat) && !isNaN(lon) && !isNaN(kmRadius) && kmRadius > 0) {
        const radiusInMeters = kmRadius * 1000;
        aggregatePipeline.push({
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [lon, lat],
            },
            distanceField: "distance",
            spherical: true,
            maxDistance: radiusInMeters,
            key: "store_location.coordinates",
          },
        });
      }
    } else if (lon && lat) {
      aggregatePipeline.push({
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [parseFloat(lon), parseFloat(lat)],
          },
          distanceField: "distance",
          spherical: true,
          key: "store_location.coordinates",
        },
      });
    }

    if (productName) {
      matchStage.itemName = { $regex: productName, $options: "i" };
    }

    if (offerType) {
      const offerTypes = offerType.split(',').map(type => type.trim());
      matchStage.offerType = { $in: offerTypes };
    }

    if (clubMembers) {
      matchStage.clubMembers = parseInt(clubMembers);
    }

    if (size) {
      matchStage.size = size;
    }

    if (date) {
      const startDate = new Date(date);
      if (!isNaN(startDate.getTime())) {
        matchStage.createdAt = { $gte: startDate };
      }
    }

    if (gender && gender != 'Any') {
      const users = await User.find({ gender: { $regex: gender, $options: "i" } }).select('_id');
      const userIds = users.map(user => user._id);
      matchStage.userId = { $in: userIds };
    }

    if (category) {
      if (!/^[0-9a-fA-F]{24}$/.test(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category ID format',
          providedId: category
        });
      }

      try {
        matchStage.category = new mongoose.Types.ObjectId(category);
        const categoryExists = await mongoose.model('OfflineCategory').findById(category);

        if (!categoryExists) {
          return res.status(404).json({
            success: false,
            message: 'Category not found',
            providedId: category
          });
        }
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Error processing category ID',
          error: e.message,
          providedId: category
        });
      }
    }

    if (subCategory) {
      try {
        matchStage.subCategory = new mongoose.Types.ObjectId(subCategory);
      } catch (e) {
        console.error('Error converting subCategory to ObjectId:', e.message);
      }
    }

    if (Object.keys(matchStage).length > 0) {
      aggregatePipeline.push({ $match: matchStage });
    }

    // Add lookups for category and subcategory names
    aggregatePipeline.push(
      // Lookup for main category from offlinecategories collection
      {
        $lookup: {
          from: "offlinecategories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      {
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      // Lookup for subcategory from offlinecategories collection
      {
        $lookup: {
          from: "offlinecategories",
          localField: "subCategory",
          foreignField: "_id",
          as: "subCategoryDetails"
        }
      },
      {
        $unwind: {
          path: "$subCategoryDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      // Add lookup for group information
      {
        $lookup: {
          from: "groups",
          let: { productId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$productId", "$$productId"] }
              }
            }
          ],
          as: "groupInfo"
        }
      },
      {
        $unwind: {
          path: "$groupInfo",
          preserveNullAndEmptyArrays: true
        }
      }
    );


    aggregatePipeline.push({
      $project: {
        _id: 1,
        userId: 1,
        clubType: 1,
        category: 1,
        categoryName: "$categoryDetails.name",
        categoryImage: "$categoryDetails.image",
        categoryType: "$categoryDetails.type",
        subCategory: 1,
        subCategoryName: "$subCategoryDetails.name",
        subCategoryImage: "$subCategoryDetails.image",
        subCategoryType: "$subCategoryDetails.type",
        itemName: 1,
        offerType: 1,
        price: 1,
        price_type: 1,
        clubMembers: 1,
        clubToJoin: {
          $cond: {
            if: { $isArray: "$groupInfo.members" },
            then: {
              $subtract: [
                "$clubMembers",
                { $size: "$groupInfo.members" }
              ]
            },
            else: { $subtract: ["$clubMembers", 1] }
          }
        },

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
    });

    if (sortBy) {
      let sortOptions = {};
      if (sortBy === "price_high_to_low") {
        sortOptions.price = -1;
      } else if (sortBy === "price_low_to_high") {
        sortOptions.price = 1;
      } else if (sortBy === "newest") {
        sortOptions.createdAt = -1;
      }
      aggregatePipeline.push({ $sort: sortOptions });
    }

    const products = await post.aggregate(aggregatePipeline);

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

//-------------------All filters in One Api--------------------------------
exports.unifiedSearch = async (req, res) => {
  try {
    const {
      gender,
      productName,
      latitude,
      longitude,
      radius,
      paymentMode,
      offerType,
      clubMembers,
      size,
      sortBy,
    } = req.query;

    let query = {};
    let sortOptions = {};


    if (gender) {
      const users = await User.find({ gender });
      const userIds = users.map((user) => user._id);

      query.userId = { $in: userIds };
    }

    if (productName) {
      query.itemName = { $regex: productName, $options: "i" };
    }

    if (latitude && longitude && radius) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const kmRadius = parseFloat(radius);

      if (!isNaN(lat) && !isNaN(lon) && !isNaN(kmRadius) && kmRadius > 0) {
        query.location = {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [lon, lat],
            },
            $maxDistance: kmRadius * 1000,
          },
        };
      }
    }

    if (paymentMode) {
      query.paymentMode = paymentMode;
    }

    if (offerType) {
      query.offerType = offerType;
    }

    if (clubMembers) {
      query.clubMembers = parseInt(clubMembers);
    }

    if (size) {
      query.size = size;
    }

    if (sortBy === "price_high_to_low") {
      sortOptions.price = -1;
    } else if (sortBy === "price_low_to_high") {
      sortOptions.price = 1;
    } else if (sortBy === "newest") {
      sortOptions.createdAt = -1;
    }

    const results = await post.find(query).sort(sortOptions);

    if (results.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};


