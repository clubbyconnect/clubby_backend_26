const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  clubType: {
    type: String,
    required: [true, 'Club type is required'],
    enum: {
      values: ['online', 'offline'],
      message: 'Club type must be either online or offline'
    }
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
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
    required: [true, 'price_type'],
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
  store_location_latitude: {
    type: String,
    default: null, // Optional for offline clubs, not required for online clubs
  },
  store_location_longitude: {
    type: String,
    default: null, // Optional for offline clubs, not required for online clubs
  },
  additionalInformation: {
    type: String,  // Optional field
    default: null, // Default is null, so it's not mandatory
  },
  size: {
    type: String,  // Optional field
    default: null, // Default is null, so it's not mandatory
  },
  itemLink: {
    type: String,
    default: null, // Optional for online clubs, not required for offline clubs
    validate: {
      validator: function(v) {
        return v ? /^(http|https):\/\/[^ "]+$/.test(v) : true;
      },
      message: 'Item link must be a valid URL'
    }
  },
  platform: {
    type: String,
    default: null, // Optional for online clubs
  },
  delivery_location_latitude: {
    type: String,
    default: null, // Optional for online clubs
  },
  delivery_location_longitude: {
    type: String,
    default: null, // Optional for online clubs
  },
  paymentMode: {
    type: String,
    default: null, // Optional for online clubs
  },
  productImage: { 
    type: String, 
    default : "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721192873/zhcbblypjd3qg4gohafv.png"
  },

  clubStatus: {
    type: String,
    enum: ['Pending', 'Created'],
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
        validator: function(v) {
          return v.trim().length > 0;
        },
        message: 'Report message cannot be empty.'
      },
      {
        validator: function(v) {
          return v.length >= 10;
        },
        message: 'Report message must be at least 10 characters long.'
      },
      {
        validator: function(v) {
          return v.length <= 300;
        },
        message: 'Report message cannot be longer than 300 characters.'
      }
    ]
  }]
}, { timestamps: true });

const Post = mongoose.model("Post", postSchema);
module.exports = Post;
