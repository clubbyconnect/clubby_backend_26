const mongoose = require('mongoose');

const offlineCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Offline category name is required.'],
    trim: true,
    minlength: [2, 'Offline category name should be at least 2 characters long.'],
    maxlength: [50, 'Offline category name cannot exceed 50 characters.']
  },
  type:{
    type: String,
    required: [true, 'Offline category type is required.'],
    trim: true,
  },
  image: {
    type: String, 
    default: "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381426/default%20images/y9yzagqvwgeyk2g1o0bj.png",
    trim: true 
  },
  offlineSubcategories: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OfflineCategory'
    }
  ]
});

const OfflineCategoryModel = mongoose.model('OfflineCategory', offlineCategorySchema);


module.exports = OfflineCategoryModel;