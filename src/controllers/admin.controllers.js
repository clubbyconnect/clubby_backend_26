const serverErrorHandler = require("../utils/serverErrorHandler.js");
const User = require("../models/user.js");
const post = require("../models/post.js");
const ChatRoom = require("../models/chatRoom.js");
const CategoryModel = require("../models/categorySchema.js")
const OfflineCategoryModel = require("../models/offlineCategorySchema.js")
const onlineCategoryModel = require("../models/onlineCategorySchema.js")

//functions
const deleteCategoryRecursive = async (categoryId) => {
  const category = await CategoryModel.findById(categoryId);
  if (category) {
    for (const subcategoryId of category.subcategories) {
      await deleteCategoryRecursive(subcategoryId);
    }
    await CategoryModel.updateMany(
      { subcategories: categoryId },
      { $pull: { subcategories: categoryId } }
    );
    await CategoryModel.findByIdAndDelete(categoryId);
  }
};

// controllers
//--------------------------------Category----------------------------------
exports.createCategory = async (req, res) => {
  try {
    const { category } = req.body;

    const isCategoryexist = await CategoryModel.findOne({name :category});
    if (isCategoryexist) return res.status(404).json({ message: 'category already exist' });

    const newCategory = await CategoryModel.create({name :category});
    if (newCategory) return res.status(200).json({ message: "category created" });
     
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

//new-----------------------------
exports.createOnlineCategory = async (req, res) => {
  try {
    const { category } = req.body;

    const isCategoryexist = await onlineCategoryModel.findOne({name :category});
    if (isCategoryexist) return res.status(404).json({ message: 'category already exist' });

    const newCategory = await onlineCategoryModel.create({name :category});
    if (newCategory) return res.status(200).json({ message: "category created" });
     
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.addSubcategory = async (req, res) => {
  const { parentCategory, SubcategoryName } = req.body;
  try {
    const pCategory = await CategoryModel.findOne({name: parentCategory});

    if (!pCategory) return res.status(404).json({ message: 'Parent category not found' });

    const sCategory = await CategoryModel.findOne({name:SubcategoryName});
    if (sCategory) return res.status(404).json({ message: 'this subCategory name already exist' });

    const newSubcategory = await CategoryModel.create({name : SubcategoryName });

    pCategory.subcategories.push(newSubcategory._id);
    await pCategory.save();

    return res.status(200).json({ message: 'subCategory created' });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

//new---------------------
exports.addOnlineSubcategory = async (req, res) => {
  const { parentCategory, SubcategoryName } = req.body;
  try {
    const pCategory = await onlineCategoryModel.findOne({name: parentCategory});

    if (!pCategory) return res.status(404).json({ message: 'Parent category not found' });

    const sCategory = await onlineCategoryModel.findOne({name:SubcategoryName});
    if (sCategory) return res.status(404).json({ message: 'this subCategory name already exist' });

    const newSubcategory = await onlineCategoryModel.create({name : SubcategoryName });

    pCategory.onlineSubcategories.push(newSubcategory._id);
    await pCategory.save();

    return res.status(200).json({ message: 'subCategory created' });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.deleteCategory = async (req, res, next) => {
  const { category } = req.body;

  try {
    const categoryToDelete = await CategoryModel.findOne({ name: category });
    if (!categoryToDelete) return res.status(404).json({ message: 'Category does not exist' });
    
    await deleteCategoryRecursive(categoryToDelete._id);
    res.status(200).json({ message: 'Category and its subcategories deleted successfully' });
  } catch (error) {
    next(serverErrorHandler(error, res));
  }
};

exports.findCategoryWithSubcategories = async (req, res) => {
  try {
    const { categoryName } = req.body;

    const result = await CategoryModel.aggregate([
      {
        "$match": {
          "name": categoryName
        }
      },
      {
        "$lookup": {
          "from": "categories", 
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
    return res.status(500).json({ message: "Unable to fetch category and subcategories. Server error!" });
  }
};

exports.createOfflineCategory = async (req, res) => {
  try {
    const { category } = req.body;

    const isCategoryexist = await OfflineCategoryModel.findOne({name :category});
    if (isCategoryexist) return res.status(404).json({ message: 'This oflline category already exist' });

    const newCategory = await OfflineCategoryModel.create({name :category});
    if (newCategory) return res.status(200).json({ message: "Ofline category created" });
     
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.addOfflineSubcategory = async (req, res) => {
  const { parentCategory, SubcategoryName } = req.body;
  try {
    const pCategory = await OfflineCategoryModel.findOne({name: parentCategory});

    if (!pCategory) return res.status(404).json({ message: 'Parent offline category not found' });

    const sCategory = await OfflineCategoryModel.findOne({name:SubcategoryName});
    if (sCategory) return res.status(404).json({ message: 'this offline subCategory name already exist' });

    const newSubcategory = await OfflineCategoryModel.create({name : SubcategoryName });

    pCategory.offlineSubcategories.push(newSubcategory._id);
    await pCategory.save();

    return res.status(200).json({ message: 'offline subCategory created' });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

//--------------------------------user----------------------------------
exports.deleteUser = async (req, res, next) => {
  const { category } = req.body;

  try {
    const categoryToDelete = await CategoryModel.findOne({ name: category });
    if (!categoryToDelete) return res.status(404).json({ message: 'Category does not exist' });
    
    await deleteCategoryRecursive(categoryToDelete._id);
    res.status(200).json({ message: 'Category and its subcategories deleted successfully' });
  } catch (error) {
    next(serverErrorHandler(error, res));
  }
};










