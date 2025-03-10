const express = require('express');
const router = express.Router();
const { verifyAdminJWT } = require("../middleware/authAdmin.js");


const upload = require("../middleware/multer.js")

const CategoryController = require('../controllers/CategoryController.js');
const SubcategoryController = require("../controllers/SubCategoryController.js");
const AdminController = require("../controllers/AdminController.js");

// ADMIN ROUTES
// Admin Details
router.post("/create", AdminController.createAdmin);
router.post("/login", AdminController.loginAdmin);
router.post("/search-post", verifyAdminJWT, AdminController.createAdmin);

// Category
router.post("/categories/create", CategoryController.createCategory);
router.post("/categories/create-with-subcategories", CategoryController.createCategoryWithSubcategories);
router.get("/categories", CategoryController.getAllCategories);
router.get("/categories/:id", CategoryController.getCategoryById);
router.put("/categories/:id", CategoryController.updateCategory);
router.delete("/categories/deleteAll", CategoryController.deleteAllCategories);
router.delete("/categories/:id", CategoryController.deleteCategory);

// SubCategory
router.post("/subcategories/create", SubcategoryController.createSubcategory);
router.get("/subcategories", SubcategoryController.getAllSubcategories);
router.get("/subcategories/:id", SubcategoryController.getSubcategoryById);
router.put("/subcategories/:id", SubcategoryController.updateSubcategory);
router.delete("/subcategories/deleteAll", SubcategoryController.deleteAllSubcategories);
router.delete("/subcategories/:id", SubcategoryController.deleteSubcategory);

module.exports = router;


