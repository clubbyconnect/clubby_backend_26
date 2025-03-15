const express = require('express');
const router = express.Router();
const {verifyAdminJWT} = require("../middleware/authAdmin.js");


const upload = require("../middleware/multer.js")

const CategoryController = require('../controllers/CategoryController.js');
const SubcategoryController = require("../controllers/SubCategoryController.js");
const AdminController = require("../controllers/AdminController.js");
const PostController = require("../controllers/PostController.js");
const {getReports} = require("../controllers/GroupController.js");

// ADMIN ROUTES
// Admin Details
router.post("/create",verifyAdminJWT, AdminController.createAdmin);
router.post("/login", AdminController.loginAdmin);

// Category
router.post("/categories/create", upload.single('image'),verifyAdminJWT, CategoryController.createCategory);
router.post("/categories/create-with-subcategories",verifyAdminJWT, CategoryController.createCategoryWithSubcategories);
router.get("/categories",verifyAdminJWT, CategoryController.getAllCategories);
router.get("/categories/:id",verifyAdminJWT, CategoryController.getCategoryById);
router.put("/categories/:id", verifyAdminJWT, upload.single('image'), CategoryController.updateCategory);
router.delete("/categories/deleteAll",verifyAdminJWT, CategoryController.deleteAllCategories);
router.delete("/categories/:id", verifyAdminJWT, CategoryController.softDeleteCategory);
router.patch("/categories/:id/restore",verifyAdminJWT, CategoryController.restoreCategory);



// SubCategory
router.post("/subcategories/create", verifyAdminJWT, upload.single('image'), SubcategoryController.createSubcategory);
router.get("/subcategories",verifyAdminJWT, SubcategoryController.getAllSubcategories);
router.get("/subcategories/:id", verifyAdminJWT, SubcategoryController.getSubcategoryById);
router.put("/subcategories/:id",verifyAdminJWT, upload.single('image'), SubcategoryController.updateSubcategory);
router.delete("/subcategories/deleteAll", verifyAdminJWT,SubcategoryController.deleteAllSubcategories);
router.delete("/subcategories/:id",verifyAdminJWT, SubcategoryController.softDeleteSubcategory);
router.patch("/subcategories/:id/restore",verifyAdminJWT, SubcategoryController.restoreSubcategory);

// POST ROUTES
router.post("/search-post",verifyAdminJWT, PostController.adminSearch);
router.get('/single-post/:postId', verifyAdminJWT, PostController.read);
router.put("/deactivate-post/:postId", verifyAdminJWT, PostController.deactivatePost);
router.post("/get-reports", verifyAdminJWT, getReports);

module.exports = router;


