const mongoose = require('mongoose');

////  Delete existing model if it already exists
//if (mongoose.models.SubCategory) {
//  delete mongoose.models.SubCategory;
//}

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Subcategory name is required.'],
    trim: true,
    minlength: [2, 'Subcategory name should be at least 2 characters long.'],
    maxlength: [50, 'Subcategory name cannot exceed 50 characters.']
  },
  image: {
    type: String,
    default: "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381426/default%20images/y9yzagqvwgeyk2g1o0bj.png",
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category', // Links to Category Model
    required: [true, "Parent Category is required"]
  },
  deletedAt: { type: Date, default: null },
},{ timestamps: true });

const SubcategoryModel = mongoose.model('Subcategory', subcategorySchema);

module.exports = SubcategoryModel;
