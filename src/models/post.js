const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: { 
    type: String, 
    required: [true, 'Title is required'],
    minlength: [3, 'Title must be at least 3 characters long'],
    maxlength: [70, 'Title must be less than 70 characters']
  },
  description: { 
    type: String, 
    required: [true, 'Description is required'],
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [1000, 'Description must be less than 1000 characters'] 
  },
  price: { 
    type: Number, 
    required: [true, 'Price is required'],
    min: [9, 'Price must be grater then 9 rupee']
  },
  quantity:{
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'] 
  },
  productLink:{
    type: String, 
    required: [true, 'Product link is required'],
    match: [/^(http|https):\/\/[^ "]+$/, "Product link must be a valid URL"],
  },
  location:{
    type: String, 
    required: [true, 'Location is required']
  },
  NumberOfclubMenber:{
    type: Number,
    required: [true, 'Number of club members is required'],
    min: [1, 'Number of club members must be at least 1'] 
  },
  clubType:{
    type: String,
    enum: {
      values: ['Online', 'Offline'],
      message: 'Club type must be Online or Offline'
    }
  },
  OfferType:{
    type: String,
    enum: {
      values: ['Discounts', 'Cashback', 'Buy One, Get One' ,'Bundle Deals','Referral Discounts',],
      message: 'Offer type must be Discounts, Cashback, Buy One-Get One , Bundle Deals , Referral Discounts'
    }
  },
  dealValidityPeriod:{
    type: String,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  subsubcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
  },
  productImage: { 
    type: String, 
    default : "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721192873/zhcbblypjd3qg4gohafv.png"
  },
  clubSatus: {
    type: String,
    enum: ['Pending', 'created'],
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
    required: [true, 'Report message is required.'],
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
  }],
  createdAt: { 
    type: Date, 
    default: Date.now
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
});

const Post = mongoose.model("Post", postSchema);
module.exports = Post;


