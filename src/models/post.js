const mongoose = require("mongoose");
const OfflineCategoryModel = require("./offlineCategorySchema.js");
const onlineCategoryModel = require("./onlineCategorySchema.js");

const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // clubType: {
  //   type: String,
  //   required: [true, 'Club type is required'],
  //   enum: {
  //     values: ['online', 'offline'],
  //     message: 'Club type must be either online or offline'
  //   }
  // },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: function () {
      return "Category";
    },
    validate: {
      validator: async function (v) {
        const CategoryModel = mongoose.model("Category");
        const category = await CategoryModel.findById(v);
        return !!category;
      },
      message: "Invalid category for the selected club type.",
    },
  },
  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: function () {
      return "Category";
    },
    validate: {
      validator: async function (v) {
        const CategoryModel = mongoose.model("Category");
        const subCategory = await CategoryModel.findById(v);
        return !!subCategory;
      },
      message: "Invalid subcategory for the selected club type.",
    },
  },
  itemName: {
    type: String,
    required: [true, 'Item name is required'],
    minlength: [3, 'Item name must be at least 3 characters long'],
    maxlength: [70, 'Item name must be less than 70 characters']
  },
  offerType: {
    type: String,
    required: [true, 'Offer type is required'],
    enum: {
      values: [
        'Buy one get one free',
        'Multi buying discount offer and divide',
        'Minimum value purchase',
        'Brands coupons for minimum purchase',
        'Bank and card offers',
        'Already have a personal coupon'
      ],
      message: 'Invalid offer type'
    }
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [9, 'Price must be greater than 9 rupees']
  },
  price_type: {
    type: String,
    required: [true, 'price_type is required'],
    enum: {
      values: ['Fixed (Price split evenly among club members)', 'Price will split based on the higher-value purchase.'],
      message: 'value should be : Fixed (Price split evenly among club members) or Price will split based on the higher-value purchase.'
    }
  },
  clubMembers: {
    type: Number,
    required: [true, 'Number of club members is required'],
    min: [1, 'Club members must be at least 1']
  },

  store_location: {
    type: {
      type: String,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      index: '2dsphere',
    },
  },
  additionalInformation: {
    type: String,
    default: null,
  },
  size: {
    type: String,
    default: null,
  },
  productImage: {
    type: String,
    default: "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721192873/zhcbblypjd3qg4gohafv.png"
  },
  clubStatus: {
    type: String,
    enum: ['Pending', 'Created', 'Full', 'Inactive', 'Active'],
    default: 'Pending'
  },
  reportCount: {
    type: Number,
    default: 0
  },
  reportedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  reportMessage: [{
    type: String,
    validate: [
      {
        validator: function (v) {
          return v.trim().length > 0;
        },
        message: 'Report message cannot be empty.'
      },
      {
        validator: function (v) {
          return v.length >= 10;
        },
        message: 'Report message must be at least 10 characters long.'
      },
      {
        validator: function (v) {
          return v.length <= 300;
        },
        message: 'Report message cannot be longer than 300 characters.'
      }
    ]
  }],
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group", 
    default: null,
  }
}, { timestamps: true });


postSchema.index({ "store_location.coordinates": "2dsphere" });


const Post = mongoose.model("Post", postSchema);
module.exports = Post;
