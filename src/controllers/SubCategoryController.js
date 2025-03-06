const SubcategoryModel = require("../models/Subcategory.js");
const CategoryModel = require("../models/Category.js");

const SubcategoryController = {
  // Create a new subcategory
  createSubcategory: async (req, res) => {
    try {
      const { name, categoryId, image } = req.body;

      if (!name || !categoryId) {
        return res.status(400).json({ error: "Subcategory name and category ID are required." });
      }

      // Check if parent category exists
      const category = await CategoryModel.findById(categoryId);
      if (!category) {
        return res.status(404).json({ error: "Parent category not found." });
      }

      const existingSubcategory = await SubcategoryModel.findOne({ name: name.trim(), category: categoryId, image: image, });
      if (existingSubcategory) {
        return res.status(409).json({ error: "Subcategory already exists under this category." });
      }

      const newSubcategory = await SubcategoryModel.create({
        name: name.trim(), category: categoryId,
      });

      return res.status(201).json({
        message: "Subcategory created successfully", subcategory: newSubcategory
      });

    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Get all subcategories
  getAllSubcategories: async (req, res) => {
    try {
      const subcategories = await SubcategoryModel.find().populate("category");
      return res.status(200).json(subcategories);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Get subcategory by ID
  getSubcategoryById: async (req, res) => {
    try {
      const subcategory = await SubcategoryModel.findById(req.params.id).populate("category");
      if (!subcategory) {
        return res.status(404).json({ error: "Subcategory not found" });
      }
      return res.status(200).json(subcategory);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  updateSubcategory: async (req, res) => {
    try {
      const { name, categoryId, image } = req.body;
      const { id } = req.params;

      // Check if subcategory exists
      const subcategory = await SubcategoryModel.findById(id);
      if (!subcategory) {
        return res.status(404).json({ error: "Subcategory not found." });
      }

      // If categoryId is provided and changed, validate the new category
      if (categoryId && categoryId !== subcategory.category.toString()) {
        const categoryExists = await CategoryModel.findById(categoryId);
        if (!categoryExists) {
          return res.status(404).json({ error: "Parent category not found." });
        }
      }

      // Check for duplicate subcategory name within the same category
      const existingSubcategory = await SubcategoryModel.findOne({
        name: name.trim(), category: categoryId || subcategory.category, _id: { $ne: id }
      });

      if (existingSubcategory) {
        return res.status(409).json({ error: "Subcategory already exists under this category." });
      }

      // Update subcategory
      const updatedSubcategory = await SubcategoryModel.findByIdAndUpdate(id, { name: name.trim(), category: categoryId || subcategory.category, image: image }, { new: true, runValidators: true });

      return res.status(200).json({
        message: "Subcategory updated successfully.", subcategory: updatedSubcategory
      });

    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: "Internal Server Error." });
    }
  },


  // Delete subcategory
  deleteSubcategory: async (req, res) => {
    try {
      const subcategory = await SubcategoryModel.findByIdAndDelete(req.params.id);
      if (!subcategory) {
        return res.status(404).json({ error: "Subcategory not found" });
      }

      return res.status(200).json({ message: "Subcategory deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Delete all subcategories
  deleteAllSubcategories: async (req, res) => {
    try {
      const result = await SubcategoryModel.deleteMany({});
      return res.status(200).json({ message: `Deleted ${result.deletedCount} subcategories` });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  fetchsubcategory: async (req, res) => {
    try {
      const { parentCategoryName } = req.body;

      const subcategories = await CategoryModel.aggregate([
        {
          $match: {
            name: parentCategoryName,
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "subcategories",
            foreignField: "_id",
            as: "subcategories",
          },
        },
        {
          $unwind: "$subcategories",
        },
        {
          $project: {
            _id: 0,
            name: "$subcategories.name",
          },
        },
      ]);

      if (subcategories && subcategories.length > 0) {
        const subcategoryNames = subcategories.map((category) => category.name);
        return res
          .status(200)
          .json({
            message: "Subcategories fetched successfully",
            data: subcategoryNames,
          });
      } else {
        return res
          .status(404)
          .json({
            error: "No subcategories found for the parent category name",
          });
      }
    } catch (error) {
      serverErrorHandler(error, res);
    }
  }
};

module.exports = SubcategoryController;
