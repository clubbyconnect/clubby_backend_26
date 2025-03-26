const PostModel = require("../models/Post.js");
const SubcategoryModel = require("../models/Subcategory.js");
const CategoryModel = require("../models/Category.js");
const Group = require("../models/Group.js");
const User = require("../models/User.js");
const mongoose = require("mongoose");

const { sendSystemMessage } = require("./MessageController.js");
const ClubRequest = require("../models/ClubRequest.js");
console.log('In POST ')
const PostController = {
  create: async (req, res) => {
    try {
      const {
        category, subCategory, itemName, offerType, price, price_type, clubMembers, store_location_latitude, store_location_longitude, additionalInformation, size, productImages, showroomAddress
      } = req.body;

      // Validate required fields
      if ([category, subCategory, itemName, offerType, price, price_type, clubMembers].some((field) => !field || field.trim() === "")) {
        return res.status(400).json({ error: "Please fill all required fields." });
      }

      // Validate club members limit (minimum 2, maximum 4)
      const memberLimit = parseInt(clubMembers, 10);
      if (isNaN(memberLimit) || memberLimit < 2 || memberLimit > 4) {
        return res.status(400).json({ error: "Club members must be between 2 and 4." });
      }

      // Fetch category and subcategory
      const categoryObj = await CategoryModel.findOne({ name: category });
      if (!categoryObj) return res.status(400).json({ error: "Invalid category." });

      const subcategoryObj = await SubcategoryModel.findOne({
        name: subCategory, category: categoryObj._id,
      });
      if (!subcategoryObj) return res.status(400).json({ error: "Invalid subcategory." });

      // Handle product image
      let productImageUrls = [subcategoryObj.image];

      if (productImages && productImages.length > 0) {
        productImageUrls = productImages;
      }

      // Set expiry time (current time + 30 days)
      const expiryAt = new Date();
      expiryAt.setDate(expiryAt.getDate() + 30);

      // Prepare post data
      const postData = {
        userId: req.User._id, postOwnerId: req.User._id, // Initially, user and post owner are the same
        itemName, offerType, price, price_type, clubMembers, category: categoryObj._id, subCategory: subcategoryObj._id, productImage: productImageUrls?.[0], productImages: productImageUrls, store_location: {
          name: showroomAddress, type: "Point", coordinates: [parseFloat(store_location_longitude), parseFloat(store_location_latitude)],
        }, expiryAt,
      };

      if (size) postData.size = size;
      if (additionalInformation) postData.additionalInformation = additionalInformation;

      // Generate unique Post ID
      const generatePostId = async () => {
        const timestamp = Date.now().toString().slice(-9);
        const randomDigit = Math.floor(Math.random() * 9) + 1;
        const postId = `CLA${randomDigit}${timestamp}`;
        const existingPost = await PostModel.findOne({ postId });
        return existingPost ? generatePostId() : postId;
      };

      postData.postId = await generatePostId();

      // Create post
      const createdPost = await PostModel.create(postData);
      if (!createdPost._id) return res.status(500).json({ error: "Unable to create post." });

      // Create group
      const groupData = {
        productId: createdPost._id, productName: itemName, adminId: req.User._id, members: [req.User._id], limit: memberLimit, isActive: true,
      };

      const createdGroup = await Group.create(groupData);
      if (!createdGroup._id) return res.status(500).json({ error: "Unable to create group." });

      // Link group to post
      createdPost.groupId = createdGroup._id;
      await createdPost.save();

      // Populate category and subcategory in the response
      const populatedPost = await PostModel.findById(createdPost._id)
        .populate("category", "name")
        .populate("subCategory", "name");

      console.log(populatedPost, "Post Created Successfully");

      // Send system message
      await sendSystemMessage(createdGroup._id, `Group is created.`);

      return res.status(200).json({
        message: "Post created successfully.", post: {
          ...populatedPost._doc, category: populatedPost.category.name, subCategory: populatedPost.subCategory.name, group: createdGroup._id,
        },
      });
    } catch (error) {
      console.error("Error in createPost:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  },

  update: async (req, res) => {
    try {
      const { postId } = req.params;
      const {
        category,
        subCategory,
        itemName,
        offerType,
        price,
        price_type,
        clubMembers,
        store_location_latitude,
        store_location_longitude,
        additionalInformation,
        size,
        productImages,
        showroomAddress
      } = req.body;

      const existingPost = await PostModel.findById(postId);
      if (!existingPost) {
        return res.status(404).json({ error: "Post not found." });
      }

      console.log("req.body", req.body)
      if ([category, subCategory, itemName, offerType, price, price_type, clubMembers].some((field) => !field || field.trim() === "")) {
        return res.status(400).json({ error: "Please fill all required fields." });
      }

      let updates = {};

      const categoryObj = await CategoryModel.findOne({ name: category });
      if (!categoryObj) return res.status(400).json({ error: "Invalid category." });
      updates.category = categoryObj._id;

      const subcategoryObj = await SubcategoryModel.findOne({ name: subCategory, category: updates.category });
      if (!subcategoryObj) return res.status(400).json({ error: "Invalid subcategory." });
      updates.subCategory = subcategoryObj._id;


      if (itemName) updates.itemName = itemName;
      if (offerType) updates.offerType = offerType;
      if (price) updates.price = price.toString();
      if (price_type) updates.price_type = price_type;

      if (clubMembers) {
        const memberLimit = parseInt(clubMembers, 10);
        if (isNaN(memberLimit) || memberLimit < 2 || memberLimit > 4) {
          return res.status(400).json({ error: "Club members must be between 2 and 4." });
        }
        updates.clubMembers = memberLimit;
        await Group.updateOne({ productId: existingPost._id }, { limit: memberLimit });
      }

      if (store_location_latitude && store_location_longitude) {
        updates.store_location = {
          name: showroomAddress,
          type: "Point",
          coordinates: [parseFloat(store_location_longitude), parseFloat(store_location_latitude)],
        };
      }

      if (size) updates.size = size;
      if (additionalInformation) updates.additionalInformation = additionalInformation;

      // Handle product images
      if (productImages && productImages.length > 0) {
        updates.productImages = productImages;
        updates.productImage = productImages[0];
      } else {
        updates.productImages = [subcategoryObj.image];
        updates.productImage = subcategoryObj.image;
      }

      await PostModel.updateOne({ _id: postId }, { $set: updates });

      const updatedPost = await PostModel.findById(postId)
        .populate("category", "name")
        .populate("subCategory", "name");

      // Send system message
      const group = await Group.findOne({ productId: postId });
      await sendSystemMessage(group._id, `Post details are updated.`);

      return res.status(200).json({
        message: "Post updated successfully.",
        post: {
          ...updatedPost._doc,
          category: updatedPost.category.name,
          subCategory: updatedPost.subCategory.name,
        },
      });
    } catch (error) {
      console.error("Error in updatePost:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  },


  read: async (req, res) => {
    try {
      const { productId } = req.params;
      const userId = req.User._id;

      if (!productId) {
        return res.status(400).json({ success: false, error: "Product ID is required." });
      }

      const product = await PostModel.findById(productId)
        .populate("userId", "firstName lastName")
        .populate("postOwnerId", "firstName lastName")
        .populate("category", "name description")
        .populate("subCategory", "name description")

      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found." });
      }

      const productData = product.toObject();

      // Check if the logged-in user has already sent a request for this post
      const clubRequest = await ClubRequest.findOne({
        requester: userId,
        postId: productId,
      }).select("status");
      productData.requestStatus = clubRequest ? clubRequest.status : null; // Return the status or null if no request exists

      return res.status(200).json({ success: true, data: productData });

    } catch (error) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  },

  delete: async (req, res) => {
    try {
      const { postId } = req.params;

      if (!postId) {
        return res.status(400).json({ error: "Post ID is required." });
      }

      // Check if the post exists
      const existingPost = await PostModel.findById(postId);
      if (!existingPost) {
        return res.status(404).json({ error: "Post not found." });
      }

      console.log("existingPost", existingPost)
      console.log("req.user", req.User);
      // Ensure the user has rights to delete the post
      if (existingPost.postOwnerId.toString() !== req.User._id.toString()) {
        return res.status(403).json({ error: "You do not have the rights to delete this post." });
      }

      //Soft Delete the post and do not change anything in group
      await PostModel.findByIdAndUpdate(postId, { deletedAt: new Date() });

      const group = await Group.findOne({ productId: postId });
      await sendSystemMessage(group._id, `Group has been deactivated.`);

      return res.status(200).json({
        message: "Post and associated group deleted successfully.", postId,
      });

    } catch (error) {
      console.error("Error in deletePost:", error);
      return res.status(500).json({ error: "Internal server error." });
    }
  },


  transfer: async (req, res) => {
    try {
      const { postId, newAdminId } = req.body;
      const userId = req.User?._id;

      if (!postId) {
        return res.status(400).json({ error: "Post ID is required." });
      }
      if (!newAdminId) {
        return res.status(400).json({ error: "New admin ID is required." });
      }

      // Fetch post and group together for efficiency
      const existingPost = await PostModel.findById(postId);
      if (!existingPost) {
        return res.status(404).json({ error: "Post not found." });
      }

      const group = await Group.findById(existingPost.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found." });
      }

      // Check if the requester is the current admin
      if (!group.adminId.equals(userId)) {
        console.log("group.adminId", group.adminId)
        console.log("userId", userId)

        return res.status(403).json({ error: "Only the current admin can transfer ownership." });
      }


      // Validate new admin
      const newAdmin = await User.findById(newAdminId);
      if (!newAdmin) {
        return res.status(404).json({ error: "New admin not found." });
      }

      // Update admin ID in both post and group
      group.adminId = newAdminId;
      existingPost.postOwnerId = newAdminId;

      // Delete club request for new post owner
      const pendingRequest = await ClubRequest.findOne({ requester: newAdminId, postId });
      if (pendingRequest) {
        await ClubRequest.deleteOne({ _id: pendingRequest._id });
      }
      // remove current owner from group
      group.members = group.members.filter(memberId => memberId.toString() !== userId.toString());
      await group.save();

      // Save changes
      await Promise.all([group.save(), existingPost.save()]);

      // Send system message
      await sendSystemMessage(group._id, `Admin rights transferred to ${newAdmin.firstName || "User"}.`);

      return res.status(200).json({ message: "Admin rights transferred successfully.", group });

    } catch (error) {
      console.error("Error transferring admin rights:", error);
      return res.status(500).json({ error: "Internal server error." });
    }
  },

  search: async (req, res) => {
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
        page = 1,
        limit = 25
      } = req.query;

      const userId = req.User._id;
      const parsedLimit = parseInt(limit) || 25;
      const parsedPage = parseInt(page) || 1;
      const skip = (parsedPage - 1) * parsedLimit;

      let matchStage = { deletedAt: null, expiryAt: { $gte: new Date() } };
      let aggregatePipeline = [];

      // Handle GeoNear for distance filtering (from 0 to 2000km)
      if ((rangeLat && rangeLon && rangeRadius) || (lon && lat)) {
        const latitude = parseFloat(rangeLat || lat);
        const longitude = parseFloat(rangeLon || lon);
        let kmRadius = parseFloat(rangeRadius) || 2000; // Default to 2000km if not provided

        if (!isNaN(latitude) && !isNaN(longitude)) {
          kmRadius = Math.max(1, Math.min(kmRadius, 2000)); // Ensure within 1 - 2000 km range
          const radiusInMeters = kmRadius * 1000;

          console.log("GeoNear Params:", { latitude, longitude, radiusInMeters });

          aggregatePipeline.push({
            $geoNear: {
              near: { type: "Point", coordinates: [longitude, latitude] },
              distanceField: "distance",
              spherical: true,
              maxDistance: radiusInMeters,
              key: "store_location.coordinates",
            },
          });
        }

      }

      if (productName) {
        matchStage.itemName = { $regex: productName, $options: "i" };
      }

      if (offerType) {
        matchStage.offerType = { $in: offerType.split(',').map(type => type.trim()) };
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

      if (category) {
        matchStage.category = new mongoose.Types.ObjectId(category);
      }

      if (subCategory) {
        matchStage.subCategory = new mongoose.Types.ObjectId(subCategory);
      }

      if (Object.keys(matchStage).length > 0) {
        aggregatePipeline.push({ $match: matchStage });
      }

      // Lookups for category and subcategory
      aggregatePipeline.push(
        { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "categoryDetails" } },
        { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: "subcategories", localField: "subCategory", foreignField: "_id", as: "subCategoryDetails" } },
        { $unwind: { path: "$subCategoryDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "groups",
            let: { productId: { $toString: "$_id" } },
            pipeline: [{ $match: { $expr: { $eq: ["$productId", "$$productId"] } } }],
            as: "groupInfo",
          },
        },
        { $unwind: { path: "$groupInfo", preserveNullAndEmptyArrays: true } }
      );

      // Projection: Convert distance to km
      aggregatePipeline.push({
        $project: {
          _id: 1,
          itemName: 1,
          additionalInformation: 1,
          price: 1,
          categoryImage: "$categoryDetails.image",
          categoryName: "$categoryDetails.name",
          subCategoryName: "$subCategoryDetails.name",
          subCategoryImage: "$subCategoryDetails.image",
          productImage: 1,
          distance: { $divide: ["$distance", 1000] }, // Convert meters to km
          clubMembers: 1,
          clubToJoin: {
            $cond: {
              if: { $isArray: "$groupInfo.members" },
              then: { $subtract: ["$clubMembers", { $size: "$groupInfo.members" }] },
              else: { $subtract: ["$clubMembers", 1] },
            },
          },
        },
      });

      // Sorting
      if (sortBy) {
        let sortOptions = {};
        if (sortBy === "price_high_to_low") sortOptions.price = -1;
        else if (sortBy === "price_low_to_high") sortOptions.price = 1;
        else if (sortBy === "newest") sortOptions.createdAt = -1;
        aggregatePipeline.push({ $sort: sortOptions });
      }

      // Pagination
      aggregatePipeline.push({ $skip: skip }, { $limit: parsedLimit });

      const products = await PostModel.aggregate(aggregatePipeline);
      const totalCountPipeline = [...aggregatePipeline, { $count: "total" }];
      const countResult = await PostModel.aggregate(totalCountPipeline);
      const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
      const totalPages = Math.ceil(totalProducts / parsedLimit);

      res.status(200).json({
        success: true,
        data: products,
        pagination: {
          totalItems: totalProducts,
          totalPages,
          currentPage: parsedPage,
          itemsPerPage: parsedLimit,
        },
      });
    } catch (error) {
      console.error("Error searching products:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  }


};

module.exports = PostController;
