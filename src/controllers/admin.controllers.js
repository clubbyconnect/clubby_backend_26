const ErrorHandler = require("../utils/ErrorHandler.js");
const User = require("../models/user.js");
const post = require("../models/post.js");
const chatRoom = require("../models/chatRoom.js");
const categoryModel = require("../models/categorySchema.js")
const initializeChatSocket = require('../sockets/chat.js'); 
const io = initializeChatSocket(); 


exports.chat = async (req, res) => {
  try {
    const groupId =2
    const userId =3

    io.emit('joinGroup', { groupId, userId });
    
    return res.status(200).json({ message: 'Message sent via API' });
  } catch (error) {
    console.log(error);
    new ErrorHandler("Unable to create ChatRoomID. Server error!", 500, res);
  }
};


//functions
const deleteCategoryRecursive = async (categoryId) => {
  const category = await categoryModel.findById(categoryId);
  if (category) {
    for (const subcategoryId of category.subcategories) {
      await deleteCategoryRecursive(subcategoryId);
    }
    await categoryModel.updateMany(
      { subcategories: categoryId },
      { $pull: { subcategories: categoryId } }
    );
    await categoryModel.findByIdAndDelete(categoryId);
  }
};

// controllers

//--------------------------------Category----------------------------------
exports.createCategory = async (req, res) => {
  try {
    const { category } = req.body;

    const isCategoryexist = await categoryModel.findOne({category});
    if (isCategoryexist) return res.status(404).json({ message: 'category already exist' });

    const newCategory = await categoryModel.create({name :category});
    if (newCategory) return res.status(200).json({ message: "category created" });
     
  } catch (error) {
    console.log(error);
    new ErrorHandler("Unable to create Category. Server error!", 500, res);
  }
};

exports.addSubcategory = async (req, res) => {
  const { parentCategory, SubcategoryName } = req.body;
  try {
    const pCategory = await categoryModel.findOne({name: parentCategory});

    if (!pCategory) return res.status(404).json({ message: 'Parent category not found' });

    const sCategory = await categoryModel.findOne({name:SubcategoryName});
    if (sCategory) return res.status(404).json({ message: 'this subCategory name already exist' });

    const newSubcategory = await categoryModel.create({name : SubcategoryName });

    pCategory.subcategories.push(newSubcategory._id);
    await pCategory.save();

    return res.status(200).json({ message: 'subCategory created' });
  } catch (error) {
    new ErrorHandler("Unable to create Subcategory. Server error!", 500, res);
  }
};

exports.deleteCategory = async (req, res, next) => {
  const { category } = req.body;

  try {
    const categoryToDelete = await categoryModel.findOne({ name: category });
    if (!categoryToDelete) return res.status(404).json({ message: 'Category does not exist' });
    
    await deleteCategoryRecursive(categoryToDelete._id);
    res.status(200).json({ message: 'Category and its subcategories deleted successfully' });
  } catch (error) {
    next(new ErrorHandler('Unable to delete category. Server error!', 500));
  }
};

exports.findCategoryWithSubcategories = async (req, res) => {
  try {
    const { categoryName } = req.body;

    const result = await categoryModel.aggregate([
      {
        "$match": {
          "name": categoryName
        }
      },
      {
        "$lookup": {
          "from": "categories", // Replace with the actual collection name
          "localField": "subcategories",
          "foreignField": "_id",
          "as": "subcategoriesDetails"
        }
      },
      {
        "$project": {
          "_id": 0,
          "name": 1,
          "subcategorieslist": {
            "$map": {
              "input": "$subcategoriesDetails",
              "as": "subcat",
              "in": "$$subcat.name"
            }
          }
        }
      }
    ]);

    if (result && result.length > 0) {
      return res.status(200).json({ message: "Category and its subcategories fetched successfully", data: result[0] });
    } else {
      return res.status(404).json({ message: "Category not found" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to fetch category and subcategories. Server error!" });
  }
};












