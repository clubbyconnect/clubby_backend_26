const mongoose = require('mongoose');


const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  image: {
    type: String, 
    default: null 
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
