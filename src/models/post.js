const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true 
  },
  quantity:{
    type: Number, 
    required: true 
  },
  productLink:{
    type: String, 
    required: true 
  },
  location:{
    type: Number, 
    required: true 
  },
  NumberOfclubMenber:{
    type: Number, 
    required: true 
  },
  clubType:{
    type: String, 
    required: false 
  },
  OfferType:{
    type: String, 
    required: false 
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


