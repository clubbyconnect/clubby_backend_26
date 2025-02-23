const PostModel = require("../models/Post.js");
const SubcategoryModel = require("../models/Subcategory.js");
const CategoryModel = require("../models/Category.js");
const Group = require("../models/group.js");
const User = require("../models/user.js");
const {sendSystemMessage} = require("./user.controller.js");
const ClubRequest = require("../models/clubRequest.js");

const PostController = {
  create: async (req, res) => {
    try {
      const {
        category, subCategory, itemName, offerType, price, price_type, clubMembers, store_location_latitude, store_location_longitude, additionalInformation, size, productImages, showroomAddress
      } = req.body;

      // Validate required fields
      if ([category, subCategory, itemName, offerType, price, price_type, clubMembers].some((field) => !field || field.trim() === "")) {
        return res.status(400).json({error: "Please fill all required fields."});
      }

      // Validate club members limit (minimum 2, maximum 4)
      const memberLimit = parseInt(clubMembers, 10);
      if (isNaN(memberLimit) || memberLimit < 2 || memberLimit > 4) {
        return res.status(400).json({error: "Club members must be between 2 and 4."});
      }

      // Fetch category and subcategory
      const categoryObj = await CategoryModel.findOne({name: category});
      if (!categoryObj) return res.status(400).json({error: "Invalid category."});

      const subcategoryObj = await SubcategoryModel.findOne({
        name: subCategory, category: categoryObj._id,
      });
      if (!subcategoryObj) return res.status(400).json({error: "Invalid subcategory."});

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
          name: showroomAddress ,type: "Point", coordinates: [parseFloat(store_location_longitude), parseFloat(store_location_latitude)],
        }, expiryAt,
      };

      if (size) postData.size = size;
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
        productId: createdPost._id, productName: itemName, adminId: req.User._id, members: [req.User._id], limit: memberLimit, isActive: true,
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

      console.log(populatedPost, "Post Created Successfully");

      return res.status(200).json({
        message: "Post created successfully.", post: {
          ...populatedPost._doc, category: populatedPost.category.name, subCategory: populatedPost.subCategory.name, group: createdGroup._id,
        },
      });
    } catch (error) {
      console.error("Error in createPost:", error);
      res.status(500).json({error: "Internal Server Error"});
    }
  },

  update: async (req, res) => {
    try {
      const {postId} = req.params;
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
        return res.status(404).json({error: "Post not found."});
      }

      console.log("req.body", req.body)
      if ([category, subCategory, itemName, offerType, price, price_type, clubMembers].some((field) => !field || field.trim() === "")) {
        return res.status(400).json({error: "Please fill all required fields."});
      }

      let updates = {};

      const categoryObj = await CategoryModel.findOne({name: category});
      if (!categoryObj) return res.status(400).json({error: "Invalid category."});
      updates.category = categoryObj._id;

      const subcategoryObj = await SubcategoryModel.findOne({name: subCategory, category: updates.category});
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

      await PostModel.updateOne({_id: postId}, {$set: updates});

      const updatedPost = await PostModel.findById(postId)
        .populate("category", "name")
        .populate("subCategory", "name");

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
      res.status(500).json({error: "Internal Server Error"});
    }
  },


  read: async (req, res) => {
    try {
      const {productId} = req.params;

      if (!productId) {
        return res.status(400).json({success: false, error: "Product ID is required."});
      }

      const product = await PostModel.findById(productId)
        .populate("userId", "firstName lastName")
        .populate("postOwnerId", "firstName lastName")
        .populate("category", "name description")
        .populate("subCategory", "name description")

      if (!product) {
        return res.status(404).json({success: false, error: "Product not found."});
      }

      const productData = product.toObject();

      return res.status(200).json({success: true, data: productData});

    } catch (error) {
      return res.status(500).json({success: false, error: "Internal Server Error. "});
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
      // Ensure the user has rights to delete the post
      if (existingPost.postOwnerId.toString() !== req.User._id.toString()) {
        return res.status(403).json({error: "You do not have the rights to delete this post."});
      }

      // Check if the post is associated with a group
      const associatedGroup = await Group.findOne({productId: postId});

      // Delete the post
      await PostModel.findByIdAndUpdate(postId, {deletedAt: new Date()});

      // Delete the associated group if found
      if (associatedGroup) {
        await Group.findByIdAndDelete(associatedGroup._id);
      }

      return res.status(200).json({
        message: "Post and associated group deleted successfully.", postId, groupId: associatedGroup ? associatedGroup._id : null,
      });

    } catch (error) {
      console.error("Error in deletePost:", error);
      return res.status(500).json({error: "Internal server error."});
    }
  },


  // USE THESE FOR FILTERS ALSO JUST ADD THE REQUIRED FIELD IN PAYLOAD AND HANDLE HERE
  getPost: async (req, res) => {
    try {
      const userId = req.User?._id;
      console.log("Fetching all active group products...");

      // Fetch active groups with product references
      const activeGroups = await Group.find({isActive: true}).select("productId limit members");

      if (!activeGroups.length) {
        return res.status(200).json({message: "No active group products found.", products: []});
      }

      // Extract product IDs from active groups
      const activeProductIds = activeGroups.map(group => group.productId);

      // Fetch corresponding product details
      const products = await PostModel.find({
        _id: {$in: activeProductIds},
        $or: [{deletedAt: null}, {deletedAt: {$exists: false}}] // do not fetch deleted
      })
        .populate("category", "name") // Populate category with only the name field
        .sort({createdAt: -1}); // Sort by latest created first


      if (!products.length) {
        return res.status(200).json({message: "No products found for active groups.", products: []});
      }

      // Retrieve user's liked (favorite) products
      let likedProductIds = [];
      if (userId) {
        const user = await User.findById(userId).select("favourites");
        likedProductIds = user?.favourites || [];
      }

      // Enrich products with group and user info
      const formattedProducts = products.map(product => {
        const group = activeGroups.find(g => g.productId.equals(product._id));

        return {
          ...product.toObject(), totalGroupLimit: group ? group.limit : 0, availableSlots: group ? group.limit - (group.members?.length || 0) : 0, isLiked: likedProductIds.some(likedId => likedId.equals(product._id)),
        };
      });

      return res.status(200).json({message: "Active group products retrieved successfully.", products: formattedProducts});

    } catch (error) {
      console.error("Error fetching active group products:", error);
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
      // remove current owner from group
      group.members = group.members.filter(memberId => memberId.toString() !== userId.toString());
      await group.save();

      // Save changes
      await Promise.all([group.save(), existingPost.save()]);

      // Send system message
      await sendSystemMessage(group._id, `Admin rights transferred to ${newAdmin.firstName || "User"}.`);

      return res.status(200).json({message: "Admin rights transferred successfully.", group});

    } catch (error) {
      console.error("Error transferring admin rights:", error);
      return res.status(500).json({error: "Internal server error."});
    }
  }
};

module.exports = PostController;
