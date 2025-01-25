const mongoose = require('mongoose');

const onlineCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'online category name is required.'],
    trim: true,
    minlength: [2, 'online category name should be at least 2 characters long.'],
    maxlength: [50, 'online category name cannot exceed 50 characters.']
  },
  image: {
    type: String, 
    default: "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381426/default%20images/y9yzagqvwgeyk2g1o0bj.png",
    trim: true 
  },
  isPremium:{
    type:Boolean,
    default:false
  },
  onlineSubcategories: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'onlineCategory'
    }
  ]
});

const onlineCategoryModel = mongoose.model('onlineCategory', onlineCategorySchema);


module.exports = onlineCategoryModel;
