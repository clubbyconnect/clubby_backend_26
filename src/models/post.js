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
    minlength: [5, 'Title must be at least 5 characters long'],
    maxlength: [100, 'Title must be less than 100 characters']
  },
  description: { 
    type: String, 
    required: [true, 'Description is required'],
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [1000, 'Description must be less than 1000 characters'] 
  },
  price: { 
    type: Number, 
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price must be a positive number']
  },
  quantity:{
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'] 
  },
  productLink:{
    type: String, 
    required: [true, 'Product link is required'],
    validate: {
      validator: function (v) {
        return /^(ftp|http|https):\/\/[^ "]+$/.test(v);
      },
      message: 'Invalid product link'
    }
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
      values: ['Male', 'Female', 'Other'],
      message: 'Club type must be Male, Female, or Other'
    }
  },
  OfferType:{
    type: String,
    enum: {
      values: ['Male', 'Female', 'Other'],
      message: 'Offer type must be Male, Female, or Other'
    }
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



// [
//   {
//     "userId": "john.doe@example.com",
//     "title": "iPhone 13 for Sale",
//     "description": "Brand new iPhone 13, 128GB, Black color. Never used.",
//     "price": 799,
//     "categoryId": "Electronics",
//     "subcategoryId": "Mobile Phones",
//     "productImage": "https://example.com/images/iphone13.jpg",
//     "createdAt": "2024-07-09T12:30:00Z",
//     "updatedAt": "2024-07-09T12:30:00Z"
//   },
//   {
//     "userId": "jane.smith@example.com",
//     "title": "Men's Leather Jacket",
//     "description": "Genuine leather jacket, size M, black color. Lightly used.",
//     "price": 150,
//     "categoryId": "Fashion",
//     "subcategoryId": "Men's Clothing",
//     "productImage": "https://example.com/images/leatherjacket.jpg",
//     "createdAt": "2024-07-09T12:35:00Z",
//     "updatedAt": "2024-07-09T12:35:00Z"
//   }
// ]

// const post1 = new Post({
//   userId: user1._id,
//   title: 'iPhone 13 for Sale',
//   description: 'Brand new iPhone 13, 128GB, Black color. Never used.',
//   price: 799,
//   categoryId: category1._id,
//   subcategoryId: subcategory1._id,
//   productImage: 'https://example.com/images/iphone13.jpg',
//   createdAt: new Date('2024-07-09T12:30:00Z'),
//   updatedAt: new Date('2024-07-09T12:30:00Z')
// });


