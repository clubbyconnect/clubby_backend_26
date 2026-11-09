const PostModel = require("../models/Post.js");
const SubcategoryModel = require("../models/Subcategory.js");
const CategoryModel = require("../models/Category.js");
const Group = require("../models/Group.js");
const User = require("../models/User.js");
const Admin = require("../models/Admin.js");
const {sendSystemMessage} = require("./MessageController.js");
const mongoose = require("mongoose");

const ClubRequest = require("../models/ClubRequest.js");
const {
  findOnlineOnlyFields,
  validateShowroomLocation,
  validateShowroomLocationIfPresent,
} = require("../utils/offlinePostValidation.js");
const { resolvePostSize } = require("../utils/clothingSizes.js");
const {
  asTrimmedString,
  isBlank,
  parsePrice,
  parseProductImages,
} = require("../utils/requestBody.js");
const {
  getOwnerId,
  isPostOwner,
  normalizePostOwner,
} = require("../utils/postOwnership.js");
const { isValidObjectId } = require("../utils/validators.js");
const { withProductThumb } = require("../utils/imageUrls.js");
const crypto = require("crypto");
const { executeProductSearch } = require("../services/productSearch.js");
const { fetchNormalizedCategories } = require("../utils/categoryList.js");
const { canViewInactivePostDetails } = require("../utils/postVisibility.js");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveSubcategory(subCategoryInput, categoryId) {
  const trimmed = asTrimmedString(subCategoryInput);
  if (
    mongoose.Types.ObjectId.isValid(trimmed) &&
    String(new mongoose.Types.ObjectId(trimmed)) === trimmed
  ) {
    return SubcategoryModel.findOne({
      _id: trimmed,
      category: categoryId,
      deletedAt: null,
    });
  }
  const byExact = await SubcategoryModel.findOne({
    name: trimmed,
    category: categoryId,
    deletedAt: null,
  });
  if (byExact) {
    return byExact;
  }
  return SubcategoryModel.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, "i") },
    category: categoryId,
    deletedAt: null,
  });
}

function logCreatePostError(error, req) {
  console.error("createPost failed:", {
    message: error.message,
    name: error.name,
    stack: error.stack,
    body: req.body,
    userId: req.User?._id,
  });
}

const PostController = {
  create: async (req, res) => {
    try {
      const {
        category, subCategory, itemName, offerType, price, price_type, clubMembers, store_location_latitude, store_location_longitude, additionalInformation, size, productImages: rawProductImages, showroomAddress, post_type, expiry_minutes
      } = req.body;

      const categoryName = asTrimmedString(category);
      const subCategoryName = asTrimmedString(subCategory);
      const itemNameTrimmed = asTrimmedString(itemName);
      const offerTypeTrimmed = asTrimmedString(offerType);
      const priceTypeTrimmed = asTrimmedString(price_type);
      const productImages = parseProductImages(rawProductImages);
      const priceResult = parsePrice(price);
      if (!priceResult.ok) {
        return res.status(400).json({ error: priceResult.error });
      }

      const onlineFields = findOnlineOnlyFields(req.body);
      if (onlineFields.length > 0) {
        return res.status(400).json({
          error: `Online-only fields are not supported: ${onlineFields.join(", ")}`,
        });
      }

      const showroomError = validateShowroomLocation(req.body);
      if (showroomError) {
        return res.status(400).json({ error: showroomError });
      }

      if (
        [categoryName, subCategoryName, itemNameTrimmed, offerTypeTrimmed, priceTypeTrimmed, clubMembers].some(
          isBlank,
        )
      ) {
        return res.status(400).json({error: "Please fill all required fields."});
      }

      const memberLimit = parseInt(clubMembers, 10);
      if (isNaN(memberLimit) || memberLimit < 2 || memberLimit > 4) {
        return res.status(400).json({error: "Club members must be between 2 and 4."});
      }

      const categoryObj = await CategoryModel.findOne({
        name: categoryName,
        deletedAt: null,
      });
      if (!categoryObj) {
        return res.status(400).json({
          error: "Invalid category.",
          hint: "Send category as the display name (e.g. \"Fit & Sport\"), not an ObjectId.",
        });
      }

      const subcategoryObj = await resolveSubcategory(subCategory, categoryObj._id);
      if (!subcategoryObj) {
        return res.status(400).json({
          error: "Invalid subcategory.",
          hint: "Send subCategory as the picker label (e.g. \"Sports Gear\") for the selected category.",
        });
      }

      let productImageUrls = [subcategoryObj.image];
      if (productImages.length > 0) {
        productImageUrls = productImages;
      }

      const resolvedPostType = asTrimmedString(post_type) || "standard";
      if (!["standard", "rapid"].includes(resolvedPostType)) {
        return res.status(400).json({ error: 'post_type must be "standard" or "rapid".' });
      }

      let expiryAt;
      let storedExpiryMinutes = null;

      if (resolvedPostType === "rapid") {
        const minutes = parseInt(expiry_minutes, 10);
        if (Number.isNaN(minutes) || minutes < 2 || minutes > 1440) {
          return res.status(400).json({
            error: "expiry_minutes must be between 2 and 1440 for rapid posts.",
          });
        }
        storedExpiryMinutes = minutes;
        expiryAt = new Date(Date.now() + minutes * 60 * 1000);
      } else {
        expiryAt = new Date();
        expiryAt.setDate(expiryAt.getDate() + 30);
      }

      // Prepare post data
      const postData = {
        userId: req.User._id, postOwnerId: req.User._id,
        itemName: itemNameTrimmed,
        offerType: offerTypeTrimmed,
        price: priceResult.price,
        price_type: priceTypeTrimmed,
        clubMembers: memberLimit,
        category: categoryObj._id,
        subCategory: subcategoryObj._id,
        productImage: productImageUrls[0],
        productImages: productImageUrls,
        store_location: {
          name: asTrimmedString(showroomAddress),
          type: "Point",
          coordinates: [parseFloat(store_location_longitude), parseFloat(store_location_latitude)],
        },
        post_type: resolvedPostType,
        expiry_minutes: storedExpiryMinutes,
        expiryAt,
      };

      const sizeResult = resolvePostSize(categoryName, size);
      if (!sizeResult.ok) {
        return res.status(400).json({ error: sizeResult.error });
      }
      if (sizeResult.size) {
        postData.size = sizeResult.size;
      }

      if (additionalInformation) postData.additionalInformation = additionalInformation;

      // Generate unique Post ID
      const generatePostId = async () => {
        const timestamp = Date.now().toString().slice(-9);
        const randomDigit = Math.floor(Math.random() * 9) + 1;
        const postId = `CLA${randomDigit}${timestamp}`;
        const existingPost = await PostModel.findOne({postId});
        return existingPost ? generatePostId() : postId;
      };

      postData.postId = await generatePostId();

      // Create post
      const createdPost = await PostModel.create(postData);
      if (!createdPost._id) return res.status(500).json({error: "Unable to create post."});

      // Create group
      const groupData = {
        productId: createdPost._id,
        productName: itemNameTrimmed,
        adminId: req.User._id,
        members: [req.User._id],
        limit: memberLimit,
        isActive: true,
      };

      const createdGroup = await Group.create(groupData);
      if (!createdGroup._id) return res.status(500).json({error: "Unable to create group."});

      // Link group to post
      createdPost.groupId = createdGroup._id;
      await createdPost.save();

      // Populate category and subcategory in the response
      const populatedPost = await PostModel.findById(createdPost._id)
        .populate("category", "name")
        .populate("subCategory", "name");

      const postId = populatedPost._id;
      res.status(200).json({
        message: "Post created successfully.",
        post: { _id: postId },
      });

      setImmediate(() => {
        sendSystemMessage(createdGroup._id, "Group is created.").catch((err) => {
          console.error("createPost: background system message failed:", err?.message || err);
        });
      });
      return;
    } catch (error) {
      logCreatePostError(error, req);
      if (error.name === "ValidationError") {
        return res.status(400).json({
          error: error.message,
          details: Object.values(error.errors || {}).map((e) => e.message),
        });
      }
      res.status(500).json({
        error: error.message || "Internal Server Error",
        code: error.code || error.name,
      });
    }
  },

  update: async (req, res) => {
    try {
      const {postId} = req.params;
      const {
        category, subCategory, itemName, offerType, price, price_type, clubMembers, store_location_latitude, store_location_longitude, additionalInformation, size, productImages: rawProductImages, showroomAddress
      } = req.body;

      const existingPost = await PostModel.findById(postId);
      if (!existingPost) {
        return res.status(404).json({error: "Post not found."});
      }

      if (!isPostOwner(existingPost, req.User._id)) {
        return res.status(403).json({
          error: "You do not have permission to update this post.",
          code: "NOT_POST_OWNER",
        });
      }

      const onlineFields = findOnlineOnlyFields(req.body);
      if (onlineFields.length > 0) {
        return res.status(400).json({
          error: `Online-only fields are not supported: ${onlineFields.join(", ")}`,
        });
      }

      const showroomError = validateShowroomLocationIfPresent(req.body);
      if (showroomError) {
        return res.status(400).json({ error: showroomError });
      }

      const categoryName = asTrimmedString(category);
      const subCategoryName = asTrimmedString(subCategory);
      const productImages = parseProductImages(rawProductImages);

      if (
        [categoryName, subCategoryName, asTrimmedString(itemName), asTrimmedString(offerType), asTrimmedString(price), asTrimmedString(price_type), clubMembers].some(
          isBlank,
        )
      ) {
        return res.status(400).json({error: "Please fill all required fields."});
      }

      let updates = {};

      const categoryObj = await CategoryModel.findOne({name: categoryName});
      if (!categoryObj) return res.status(400).json({error: "Invalid category."});
      updates.category = categoryObj._id;

      const subcategoryObj = await SubcategoryModel.findOne({name: subCategoryName, category: updates.category});
      if (!subcategoryObj) return res.status(400).json({error: "Invalid subcategory."});
      updates.subCategory = subcategoryObj._id;


      if (itemName) updates.itemName = itemName;
      if (offerType) updates.offerType = offerType;
      if (price) updates.price = price.toString();
      if (price_type) updates.price_type = price_type;

      if (clubMembers) {
        const memberLimit = parseInt(clubMembers, 10);
        if (isNaN(memberLimit) || memberLimit < 2 || memberLimit > 4) {
          return res.status(400).json({error: "Club members must be between 2 and 4."});
        }
        updates.clubMembers = memberLimit;
        await Group.updateOne({productId: existingPost._id}, {limit: memberLimit});
      }

      if (
        store_location_latitude !== undefined ||
        store_location_longitude !== undefined ||
        showroomAddress !== undefined
      ) {
        updates.store_location = {
          name: showroomAddress,
          type: "Point",
          coordinates: [
            parseFloat(store_location_longitude),
            parseFloat(store_location_latitude),
          ],
        };
      }

      const sizeResult = resolvePostSize(categoryName, size);
      if (!sizeResult.ok) {
        return res.status(400).json({ error: sizeResult.error });
      }
      updates.size = sizeResult.size;

      if (additionalInformation) updates.additionalInformation = additionalInformation;

      if (productImages.length > 0) {
        updates.productImages = productImages;
        updates.productImage = productImages[0];
      } else {
        updates.productImages = [subcategoryObj.image];
        updates.productImage = subcategoryObj.image;
      }

      await PostModel.updateOne({_id: postId}, {$set: updates});

      const updatedPost = await PostModel.findById(postId)
        .populate("category", "name")
        .populate("subCategory", "name");

      // Send system message
      const group = await Group.findOne({productId: postId});
      await sendSystemMessage(group._id, `Post details are updated.`);

      return res.status(200).json({
        message: "Post updated successfully.", post: {
          ...updatedPost._doc, category: updatedPost.category.name, subCategory: updatedPost.subCategory.name,
        },
      });
    } catch (error) {
      console.error("Error in updatePost:", error);
      res.status(500).json({error: error.message || "Internal Server Error"});
    }
  },


  read: async (req, res) => {
    try {
      const {productId, postId} = req.params;

      const query = productId ? {_id: productId} : {postId: postId};

      if (!productId && !postId) {
        return res.status(400).json({success: false, error: "Product ID is required."});
      }

      const product = await PostModel.findOne(query)
        .populate("userId", "firstName lastName")
        .populate("postOwnerId", "firstName lastName")
        .populate("category", "name description")
        .populate("subCategory", "name description")

      if (!product) {
        return res.status(404).json({success: false, error: "Product not found."});
      }

      const productData = product.toObject();
      const userId = req.User._id;
      const ownerId = getOwnerId(product);

      productData.postOwnerId = await normalizePostOwner(product.postOwnerId);
      productData.isPostOwner = isPostOwner(product, userId);

      const group = await Group.findOne({productId: product._id})
        .populate("members", "firstName lastName userName _id avatar"); 
      if (!canViewInactivePostDetails(product, group, userId)) {
        return res.status(403).json({
          success: false,
          error: "This post is inactive or wrapped and is only available to club members.",
          code: "POST_DETAILS_RESTRICTED",
        });
      }
      productData.members = group ? group.members : [];

      const postMongoId = String(product._id);
      const postObjectId = product._id;
      const clubRequest = await ClubRequest.findOne({
        requester: userId,
        postId: { $in: [postObjectId, postMongoId] },
      }).select("status");

      const { resolveVisitorRequestState } = require("../utils/clubRejoin.js");
      const visitorState = resolveVisitorRequestState(group, userId, clubRequest, {
        isPostOwner: productData.isPostOwner,
      });
      productData.requestStatus = visitorState.requestStatus;
      productData.membershipStatus = visitorState.membershipStatus;
      productData.leaveCount = visitorState.leaveCount;
      productData.canRejoin = visitorState.canRejoin;
      productData.feedHidden = visitorState.feedHidden;
      productData.rejoinMessage = visitorState.rejoinMessage;

      if (productData.isPostOwner) {
        productData.pendingRequestCount = await ClubRequest.countDocuments({
          postId: { $in: [postObjectId, postMongoId] },
          status: "pending",
        });
      } else {
        productData.pendingRequestCount = 0;
      }

      // If the product was deactivated by an admin, fetch admin details
      if (product.deactivatedByAdminId) {
        const admin = await Admin.findById(product.deactivatedByAdminId).select("name image");
        productData.deactivatedByAdmin = admin || null;
      }

      return res.status(200).json({success: true, data: productData});

    } catch (error) {
      res.status(500).json({error: error.message || "Internal Server Error"});
    }
  },

  delete: async (req, res) => {
    try {
      const {postId} = req.params;

      if (!postId) {
        return res.status(400).json({error: "Post ID is required."});
      }

      // Check if the post exists
      const existingPost = await PostModel.findById(postId);
      if (!existingPost) {
        return res.status(404).json({error: "Post not found."});
      }

      console.log("existingPost", existingPost)
      console.log("req.user", req.User);
      if (!isPostOwner(existingPost, req.User._id)) {
        return res.status(403).json({
          error: "You do not have permission to delete this post.",
          code: "NOT_POST_OWNER",
        });
      }

      //Soft Delete the post and do not change anything in group
      await PostModel.findByIdAndUpdate(postId, {deletedAt: new Date()});

      const group = await Group.findOne({productId: postId});
      await sendSystemMessage(group._id, `Group has been deactivated.`);

      return res.status(200).json({
        message: "Post and associated group deleted successfully.", postId,
      });

    } catch (error) {
      console.error("Error in deletePost:", error);
      return res.status(500).json({error: "Internal server error."});
    }
  },


  transfer: async (req, res) => {
    try {
      const {postId, newAdminId} = req.body;
      const userId = req.User?._id;

      if (!postId) {
        return res.status(400).json({error: "Post ID is required."});
      }
      if (!newAdminId) {
        return res.status(400).json({error: "New admin ID is required."});
      }

      // Fetch post and group together for efficiency
      const existingPost = await PostModel.findById(postId);
      if (!existingPost) {
        return res.status(404).json({error: "Post not found."});
      }

      const group = await Group.findById(existingPost.groupId);
      if (!group) {
        return res.status(404).json({error: "Group not found."});
      }

      // Check if the requester is the current admin
      if (!group.adminId.equals(userId)) {
        console.log("group.adminId", group.adminId)
        console.log("userId", userId)

        return res.status(403).json({error: "Only the current admin can transfer ownership."});
      }


      // Validate new admin
      const newAdmin = await User.findById(newAdminId);
      if (!newAdmin) {
        return res.status(404).json({error: "New admin not found."});
      }

      // Update admin ID in both post and group
      group.adminId = newAdminId;
      existingPost.postOwnerId = newAdminId;

      // Delete club request for new post owner
      const pendingRequest = await ClubRequest.findOne({requester: newAdminId, postId});
      if (pendingRequest) {
        await ClubRequest.deleteOne({_id: pendingRequest._id});
      }
      const { recordUserLeft } = require("../utils/groupMembership.js");
      recordUserLeft(group, new mongoose.Types.ObjectId(userId));
      await group.save();

      // Save changes
      await Promise.all([group.save(), existingPost.save()]);

      // Send system message
      await sendSystemMessage(group._id, `Admin rights transferred to ${newAdmin.firstName || "User"}.`);

      return res.status(200).json({message: "Admin rights transferred successfully.", group});

    } catch (error) {
      console.error("Error transferring admin rights:", error);
      return res.status(500).json({error: error.message || "Internal server error."});
    }
  },

  search: async (req, res) => {
    const startedAt = Date.now();
    try {
      const result = await executeProductSearch(
        req.User._id,
        req.query,
        { ifNoneMatch: req.headers["if-none-match"] },
      );

      if (result.error) {
        return res.status(result.error.status).json(result.error.body);
      }
      if (result.notModified) {
        res.setHeader("ETag", result.etag);
        return res.status(304).end();
      }

      const durationMs = Date.now() - startedAt;
      if (durationMs >= 500) {
        console.warn(
          `[slow-query] GET searchProducts ${durationMs}ms page=${result.pagination.currentPage}`,
        );
      }

      res.setHeader("ETag", result.etag);
      res.status(200).json({
        success: true,
        data: result.products,
        pagination: result.pagination,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error searching products:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  },

  homeBootstrap: async (req, res) => {
    const startedAt = Date.now();
    try {
      const query = {
        ...req.query,
        page: req.query.page || 1,
        limit: req.query.limit || 30,
      };
      const ifNoneMatch = req.headers["if-none-match"];

      const [categoriesResult, productsResult] = await Promise.all([
        fetchNormalizedCategories(),
        executeProductSearch(req.User._id, query, { skip304: true }),
      ]);

      if (productsResult.error) {
        return res.status(productsResult.error.status).json(productsResult.error.body);
      }

      const etagSource = JSON.stringify({
        categories: categoriesResult.fingerprint,
        productsEtag: productsResult.etag,
      });
      const etag = `"${crypto.createHash("md5").update(etagSource).digest("hex")}"`;
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.setHeader("ETag", etag);
        return res.status(304).end();
      }

      const durationMs = Date.now() - startedAt;
      if (durationMs >= 500) {
        console.warn(`[slow-query] GET homeBootstrap ${durationMs}ms`);
      }

      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(200).json({
        success: true,
        categories: categoriesResult.data,
        products: {
          data: productsResult.products,
          pagination: productsResult.pagination,
        },
        productsEtag: productsResult.etag,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in homeBootstrap:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  },

  adminSearch: async (req, res) => {
    try {
      const {keyword, status, startDate, endDate, page = 1, limit = 20} = req.body;
      const skip = (page - 1) * limit; // Calculate offset

      let matchQuery = {};

      // Keyword search in itemName (case-insensitive)
      if (keyword) {
        matchQuery.itemName = {$regex: keyword, $options: "i"};
      }

      // Status Filtering
      if (status) {
        if (status === "active") {
          matchQuery.$and = [
            { clubStatus: { $in: ["Active", "Created", "Full", "Pending"] } }, // Active statuses only
            { deletedAt: null }, // Not soft-deleted
            { expiryAt: { $gte: new Date() } }, // Not expired
          ];
        } else if (status === "inactive") {
          matchQuery.$or = [{clubStatus:  {$in: ["Inactive", "Wrap"]}}, {deletedAt: {$ne: null}}, // Soft-deleted posts
            {expiryAt: {$lt: new Date()}}, // Expired posts
          ];
        } else if (status === "paid") {
          matchQuery.isPaid = true; // Filtering for paid posts
        } else if(status === "wrapped"){
          matchQuery.clubStatus = "Wrap";
        } else if (status === "deactivated") {
          matchQuery.deactivatedByAdminId = { $exists: true };
        }
      }

      // Time range filter (createdAt)
      if (startDate && endDate) {
        matchQuery.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
        };
      } else if (startDate) {
        matchQuery.createdAt = {$gte: new Date(startDate)};
      } else if (endDate) {
        matchQuery.createdAt = { $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) };
      }

      // Aggregate pipeline with pagination
      const aggregatePipeline = [{$match: matchQuery}, {$sort: {createdAt: -1}}, // Sort by latest posts
        {$skip: skip}, // Skip records for pagination
        {$limit: Number(limit)}, // Limit records per page
        {
          $project: { // Return only specific fields
            _id: 1, itemName: 1, price: 1, productImage: 1, postId: 1,
          }
        }];

      // Fetch posts and total count
      const [posts, total] = await Promise.all([PostModel.aggregate(aggregatePipeline), PostModel.countDocuments(matchQuery),]);

      res.status(200).json({
        message: "Posts retrieved successfully", posts, pagination: {
          currentPage: Number(page), totalPages: Math.ceil(total / limit), totalPosts: total, limit: Number(limit),
        },
      });
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({message: error.message || "Internal server error"});
    }
  },


  deactivatePost: async (req, res) => {
    try {
      const {postId} = req.params;
      const {note} = req.body; // Get admin ID and note from request
      const adminId = req.Admin?._id;

      if (!postId) return res.status(400).json({error: "Post ID is required."});
      if (!note || note.trim().length === 0) return res.status(400).json({error: "Deactivation note is required."});

      // Check if the post exists
      const existingPost = await PostModel.findOne({ postId: postId });
      if (!existingPost) return res.status(404).json({error: "Post not found."});

      // Soft delete the post with admin details
      await PostModel.findOneAndUpdate(
        { postId: postId },  // Find by postId, not _id
        {
          deletedAt: new Date(),
          deactivatedByAdminId: adminId,
          deactivationNote: note,
        }
      );

      const group = await Group.findOne({productId: existingPost._id});
      if (group) {
        console.log("group", group)
        await sendSystemMessage(group._id, `Group has been deactivated by admin. Reason: ${note}`);
      }
      return res.status(200).json({
        message: "Post deactivated successfully."
      });
    } catch (error) {
      console.error("Error in deactivatePost:", error);
      return res.status(500).json({error: error.message || "Internal server error."});
    }
  },

  getPostStatsByCategory: async (req, res) => {
    try {
      // Aggregate categories with post statistics in one query
      const categoryStats = await CategoryModel.aggregate([
        {
          $lookup: {
            from: "posts", // Collection name in MongoDB (ensure it's correct)
            localField: "_id",
            foreignField: "category",
            as: "posts"
          }
        },
        {
          $addFields: {
            totalPosts: { $size: "$posts" },
            paidPosts: {
              $size: {
                $filter: {
                  input: "$posts",
                  as: "post",
                  cond: { $eq: ["$$post.isPaid", true] }
                }
              }
            }
          }
        },
        {
          $project: {
            id: "$_id",
            name: 1,
            image: 1,
            isPremium: 1,
            totalPosts: 1,
            paidPosts: 1
          }
        }
      ]);

      res.status(200).json({data: categoryStats});
    } catch (error) {
      res.status(500).json({ error: error.message || "Internal server error." });
    }
  }


};

module.exports = PostController;
