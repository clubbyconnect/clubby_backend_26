const CategoryModel = require('../models/Category.js');
const SubcategoryModel = require("../models/Subcategory.js");
const uploadOnCloudinary = require("../utils/Cloudinary.js");

module.exports = {
  // Create Category
  createCategory: async (req, res) => {
    try {
      let {name, isPremium, image} = req.body;
      if (!name) {
        return res.status(400).json({error: "Category name is required."});
      }
      name = name.trim(); // Trim whitespace
      const isCategoryExist = await CategoryModel.findOne({name});
      if (isCategoryExist) {
        return res.status(409).json({error: "Category already exists"});
      }
      // Handle image upload (file or direct URL)
      let imageUrl = image;
      if (req.file) {
        const uploadedImage = await uploadOnCloudinary(req.file.path);
        imageUrl = uploadedImage.secure_url;
      }
      if (typeof isPremium === "string") {
        isPremium = isPremium.toLowerCase() === "true";
      }
      // Create new category
      const newCategory = await CategoryModel.create({name, isPremium, image: imageUrl});
      return res.status(201).json({
        message: "Category created successfully", category: newCategory
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({error: error.message || "Internal Server Error"});
    }
  },


  createCategoryWithSubcategories: async (req, res) => {
    try {
      const {name, image, isPremium, subcategories} = req.body;

      if (!name) {
        return res.status(400).json({error: "Category name is required."});
      }

      //  Check if the category already exists
      let existingCategory = await CategoryModel.findOne({name: name.trim()});
      if (existingCategory) {
        return res.status(409).json({error: "Category already exists."});
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
      res.status(500).json({error: "Internal Server Error"});
    }
  },

  getAllCategories: async (req, res) => {
    try {
      const categories = await CategoryModel.aggregate([{
        $lookup: {
          from: "subcategories", localField: "_id", foreignField: "category", as: "subcategories"
        }
      }]);

      return res.status(200).json({
        message: "Categories fetched successfully", data: categories
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({error: "Internal Server Error"});
    }
  },


  // Get category by ID
  getCategoryById: async (req, res) => {
    try {
      const category = await CategoryModel.findById(req.params.id).lean();
      if (!category) {
        return res.status(404).json({error: "Category not found"});
      }

      // Fetch subcategories related to this category
      const subcategories = await SubcategoryModel.find({category: category._id});

      return res.status(200).json({...category, subcategories});
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({error: "Internal Server Error"});
    }
  },


  // Update category
  updateCategory: async (req, res) => {
    try {
      const {name, isPremium, image} = req.body;
      const {id} = req.params;

      // Find the existing category
      const category = await CategoryModel.findById(id);
      if (!category) {
        return res.status(404).json({error: "Category not found"});
      }

      let updatedImage = category.image;
      if (req.file) {
        const uploadedImage = await uploadOnCloudinary(req.file.path);
        updatedImage = uploadedImage.secure_url;
      } else if (image) {
        updatedImage = image;
      }

      console.log("image", image)
      console.log("req.file", req.file)

      // Update category
      const updatedCategory = await CategoryModel.findByIdAndUpdate(id, {
        name: name.trim(), isPremium: typeof isPremium === "boolean" ? isPremium : isPremium === "true", image: updatedImage
      }, {new: true, runValidators: true});

      return res.status(200).json({
        message: "Category updated successfully", category: updatedCategory
      });

    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({error: error.message || "Internal Server Error"});
    }
  },


  // Delete category by ID
  permanentDeleteCategory: async (req, res) => {
    try {
      const category = await CategoryModel.findByIdAndDelete(req.params.id);
      if (!category) {
        return res.status(404).json({error: "Category not found"});
      }

      return res.status(200).json({message: "Category deleted successfully"});
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({error: "Internal Server Error"});
    }
  },

  // Soft delete category
  softDeleteCategory: async (req, res) => {
    try {
      const {id} = req.params;
      if (!id) return res.status(400).json({error: "Category ID is required"});
      const category = await CategoryModel.findByIdAndUpdate(id, {deletedAt: Date.now()});
      if (!category) return res.status(404).json({error: "Category not found"});
      res.status(200).json({message: "Category soft deleted successfully"});
    } catch (error) {
      res.status(500).json({error: error.message || "Internal Server Error"});
    }
  },

  // Restore soft-deleted category
  restoreCategory: async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "Category ID is required" });

      const category = await CategoryModel.findByIdAndUpdate(id, { deletedAt: null });
      if (!category) return res.status(404).json({ error: "Category not found" });

      res.status(200).json({ message: "Category restored successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  },


  // Delete all categories
  deleteAllCategories: async (req, res) => {
    try {
      const result = await CategoryModel.deleteMany({}); // Deletes all categories
      return res.status(200).json({message: `Deleted ${result.deletedCount} categories`});
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({error: error.message || "Internal Server Error"});
    }
  },

  getCategoryName: async (req, res) => {
    try {
      const {categoryId} = req.params;
      if (!categoryId) {
        return res.status(400).json({success: false, message: "Category ID is required"});
      }
      const category = await CategoryModel.findById(categoryId);
      if (!category) {
        return res.status(404).json({success: false, message: "Category not found"})
      }
      const categoryResponse = {
        id: category._id, name: category.name,
      }
      res.status(200).json({success: true, data: [categoryResponse]});
    } catch (e) {
      console.error(e);
      res.status(500).json({success: false, message: "Server error"});
    }
  },

  /** Legacy clients calling fetchOnlinecategory — offline-only product. */
  onlineDiscontinued: async (req, res) => {
    return res.status(410).json({ error: 'Online mode discontinued' });
  },
};
