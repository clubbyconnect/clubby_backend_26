const serverErrorHandler = require("../utils/serverErrorHandler.js");
const User = require("../models/user.js");
const CategoryModel = require("../models/categorySchema.js");
const OfflineCategoryModel = require("../models/offlineCategorySchema.js");
const onlineCategoryModel = require("../models/onlineCategorySchema.js")
const post = require("../models/post.js");
const admin = require('firebase-admin');

//Firebase-setup
const serviceAccount = {
  type : process.env.type,
  project_id : process.env.project_id,
  private_key_id :process.env.private_key_id,
  private_key :process.env.private_key,
  client_email : process.env.client_email,
  client_id : process.env.client_id,
  auth_uri : process.env.auth_uri,
  token_uri : process.env.token_uri,
  auth_provider_x509_cert_url : process.env.auth_provider_x509_cert_url,
  client_x509_cert_url : process.env.client_x509_cert_url,
  universe_domain : process.env.universe_domain
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
          return res.status(200).json({message: "Successfully sent message", data : response});
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

//serching APi's
exports.serchByProductName = async (req, res) => {
  try {
    const { productName } = req.query;

    if (!productName) {
      return res.status(400).json({ message: "Product name is required" });
    }

    const products = await post.find({
      itemName: { $regex: productName, $options: "i" } 
    });

    if (products.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    res.status(200).json({ products });
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
        message: "Latitude, longitude, and radius are required.",
      });
    }

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

    const results = await post.find({
      location: {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [lon, lat], // Longitude first, then latitude
          },
          $maxDistance: radiusInMeters, 
        },
      },
    });

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    serverErrorHandler(error, res);
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

      if (user && user.gender === gender) {
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
    const { offerType, paymentMode, clubMembers, size } = req.query;

    let filter = {};

    if (offerType) {
      filter.offerType = offerType; 
    }

    if (paymentMode) {
      filter.paymentMode = paymentMode; 
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

//-------------------All filters in One Api--------------------------------
exports.unifiedSearch = async (req, res) => {
  try {
    const {
      productName,
      latitude,
      longitude,
      radius,
      gender,
      date,
      offerType,
      paymentMode,
      clubMembers,
      size,
      sortBy,
    } = req.query;

    let filter = {};
    let sortOptions = {};
    let locationFilter = null;

    if (productName) {
      filter.itemName = { $regex: productName, $options: "i" };
    }

    if (latitude && longitude && radius) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const kmRadius = parseFloat(radius);

      if (!isNaN(lat) && !isNaN(lon) && !isNaN(kmRadius) && kmRadius > 0) {
        locationFilter = {
          location: {
            $nearSphere: {
              $geometry: {
                type: "Point",
                coordinates: [lon, lat],
              },
              $maxDistance: kmRadius * 1000,
            },
          },
        };
      }
    }

    if (gender) {
      const products = await post.find();
      const filteredProducts = [];
      for (const product of products) {
        const user = await User.findById(product.userId);
        if (user && user.gender === gender) {
          filteredProducts.push(product);
        }
      }
      if (filteredProducts.length === 0) {
        return res.status(404).json({ message: "No products found for the specified gender" });
      }
      return res.status(200).json({ products: filteredProducts });
    }

    if (date) {
      const startDate = new Date(date);
      if (!isNaN(startDate.getTime())) {
        filter.createdAt = { $gte: startDate };
      } else {
        return res.status(400).json({ message: "Invalid date format" });
      }
    }


    if (offerType) filter.offerType = offerType;
    if (paymentMode) filter.paymentMode = paymentMode;
    if (clubMembers) filter.clubMembers = parseInt(clubMembers);
    if (size) filter.size = size;

    if (sortBy === "price_high_to_low") {
      sortOptions.price = -1;
    } else if (sortBy === "price_low_to_high") {
      sortOptions.price = 1;
    } else if (sortBy === "newest") {
      sortOptions.createdAt = -1;
    }

    const query = locationFilter ? { ...filter, ...locationFilter } : filter;

    const results = await post.find(query).sort(sortOptions);

    if (results.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

