const mongoose = require('mongoose');


const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required.'],
    trim: true,
    minlength: [2, 'Category name should be at least 2 characters long.'],
    maxlength: [50, 'Category name cannot exceed 50 characters.']
  },
  image: {
    type: String, 
    default: "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381426/default%20images/y9yzagqvwgeyk2g1o0bj.png",
    trim: true 
  },
  subcategories: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }
  ]
});

const categoryModel = mongoose.model('Category', categorySchema);


module.exports = categoryModel;
