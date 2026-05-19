const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    postOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      required: true,
    },
    itemName: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 70,
    },
    offerType: {
      type: String,
      required: true,
      enum: [
        "Buy one get one free",
        "Multi buying discount offer and divide",
        "Minimum value purchase",
        "Brands coupons for minimum purchase",
        "Bank and card offers",
        "Already have a personal coupon",
      ],
    },
    price: {
      type: Number,
      required: true,
      min: 9,
    },
    price_type: {
      type: String,
      required: true,
      enum: [
        "Fixed (Price split evenly among club members)",
        "Price will split based on the higher-value purchase.",
      ],
    },
    clubMembers: {
      type: Number,
      required: true,
      min: 2,
      max: 4,
    },
    store_location: {
      type: {
        type: String,
        default: "Point",
      },
      name: {
        type: String,
        default: "Somewhere in the world",
      },
      coordinates: {
        type: [Number],
      },
    },
    additionalInformation: {
      type: String,
      default: null,
    },
    isPaid:{
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      default: null,
    },
    postId: {
      type: String,
      required: true,
      unique: true,
    },
    productImage: {
      type: String,
      default:
        "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381426/default%20images/y9yzagqvwgeyk2g1o0bj.png",
    },
    productImages: {
      type: [String],
      default:
        ["https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381426/default%20images/y9yzagqvwgeyk2g1o0bj.png"],
    },
    clubStatus: {
      type: String,
      enum: ["Pending", "Created", "Full", "Inactive", "Active", "Wrap"],
      default: "Created",
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    deactivatedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    deactivationNote: {
      type: String,
      default: null,
    },
    expiryAt: {
      type: Date,
      required: true,
    },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

postSchema.index({ "store_location.coordinates": "2dsphere" });

const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
module.exports = Post;
