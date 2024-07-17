const ErrorHandler = require("../utils/ErrorHandler.js");
const User = require("../models/user.js");
const categoryModel = require("../models/categorySchema.js");

// controllers-----------------------------------
exports.fetchallcategory = async (req, res) => {
  try {
    const allcategory = await categoryModel.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "subcategories",
          as: "parentCategories",
        },
      },
      {
        $match: {
          parentCategories: { $size: 0 },
        },
      },
      {
        $project: {
          name: 1,
        },
      },
    ]);
    if (allcategory && allcategory.length > 0) {
      const categoryNames = allcategory.map((category) => category.name);
      return res
        .status(200)
        .json({
          message: "Top-level categories fetched successfully",
          data: categoryNames,
        });
    } else {
      return res.status(404).json({ message: "No top-level categories found" });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Unable to fetch allcategory. Server error!" });
  }
};

exports.fetchsubcategory = async (req, res) => {
  try {
    const { parentCategoryName } = req.body;

    const subcategories = await categoryModel.aggregate([
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
          message: "No subcategories found for the parent category name",
        });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Unable to fetch subcategories. Server error!" });
  }
};
