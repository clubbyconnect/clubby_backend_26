const CategoryModel = require('../models/Category');
const SubcategoryModel = require("../models/Subcategory");

module.exports = {
  // Create Category
  createCategory: async (req, res) => {
    try {
      let {name, isPremium, image} = req.body;

      if (!name) {
        return res.status(400).json({message: "Category name is required."});
      }

      name = name.trim(); // Trim whitespace

      const isCategoryExist = await CategoryModel.findOne({name});
      if (isCategoryExist) {
        return res.status(409).json({message: "Category already exists"});
      }

      const newCategory = await CategoryModel.create({name, isPremium, image});

      return res.status(201).json({
        message: "Category created successfully", category: newCategory
      });

    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({message: "Internal Server Error"});
    }
  },

  createCategoryWithSubcategories: async (req, res) => {
    try {
      const {name, image, isPremium, subcategories} = req.body;

      if (!name) {
        return res.status(400).json({message: "Category name is required."});
      }

      //  Check if the category already exists
      let existingCategory = await CategoryModel.findOne({name: name.trim()});
      if (existingCategory) {
        return res.status(409).json({message: "Category already exists."});
      }

      // Create the category
      const newCategory = await CategoryModel.create({
        name: name.trim(), image, isPremium: isPremium || false
      });

      // If subcategories are provided, create them
      let createdSubcategories = [];
      if (subcategories && Array.isArray(subcategories) && subcategories.length > 0) {
        createdSubcategories = await Promise.all(subcategories.map(async (subName) => {
          return await SubcategoryModel.create({
            name: subName.trim(), category: newCategory._id
          });
        }));
      }

      return res.status(201).json({
        message: "Category and subcategories created successfully", category: newCategory, subcategories: createdSubcategories
      });

    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({message: "Internal Server Error"});
    }
  },

  getAllCategories: async (req, res) => {
    try {
      const categories = await CategoryModel.find()
        .lean() // Improves performance by returning plain JavaScript objects
        .then(async (categories) => {
          return Promise.all(categories.map(async (category) => {
            const subcategories = await SubcategoryModel.find({category: category._id});
            return {...category, subcategories}; // Merge subcategories into category object
          }));
        });

      return res.status(200).json({
        message: "Categories fetched successfully", data: categories
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({message: "Internal Server Error"});
    }
  },


  // Get category by ID
  getCategoryById: async (req, res) => {
    try {
      const category = await CategoryModel.findById(req.params.id).lean();
      if (!category) {
        return res.status(404).json({message: "Category not found"});
      }

      // Fetch subcategories related to this category
      const subcategories = await SubcategoryModel.find({category: category._id});

      return res.status(200).json({...category, subcategories});
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({message: "Internal Server Error"});
    }
  },


  // Update category
  updateCategory: async (req, res) => {
    try {
      const {name, isPremium, image} = req.body;
      const category = await CategoryModel.findByIdAndUpdate(req.params.id, {name, isPremium, image}, {new: true, runValidators: true});

      if (!category) {
        return res.status(404).json({message: "Category not found"});
      }

      return res.status(200).json({
        message: "Category updated successfully", category
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({message: "Internal Server Error"});
    }
  },

  // Delete category by ID
  deleteCategory: async (req, res) => {
    try {
      const category = await CategoryModel.findByIdAndDelete(req.params.id);
      if (!category) {
        return res.status(404).json({message: "Category not found"});
      }

      return res.status(200).json({message: "Category deleted successfully"});
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({message: "Internal Server Error"});
    }
  },

  // Delete all categories
  deleteAllCategories: async (req, res) => {
    try {
      const result = await CategoryModel.deleteMany({}); // Deletes all categories
      return res.status(200).json({message: `Deleted ${result.deletedCount} categories`});
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({message: "Internal Server Error"});
    }
  }
};
