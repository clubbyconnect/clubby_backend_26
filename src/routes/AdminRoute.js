const express = require('express');
const router = express.Router();
const {verifyAdminJWT} = require("../middleware/authAdmin.js");
const { requireValidObjectId } = require("../middleware/validateObjectId.js");


const upload = require("../middleware/multer.js")

const CategoryController = require('../controllers/CategoryController.js');
const SubcategoryController = require("../controllers/SubCategoryController.js");
const AdminController = require("../controllers/AdminController.js");
const PostController = require("../controllers/PostController.js");
const UserController = require("../controllers/UserController.js");

const {getReports} = require("../controllers/GroupController.js");

// ADMIN ROUTES
// Admin Details
router.post("/create", verifyAdminJWT(2), AdminController.createAdmin);
router.post("/login", AdminController.loginAdmin);
router.post('/send-verification-code', AdminController.sendVerificationCode);
router.post('/verify-otp-reset-password', AdminController.verifyOtpAndResetPassword);

router.get("/admin-details",verifyAdminJWT(), AdminController.getAdminDetails);
router.put("/admin-details",verifyAdminJWT(),upload.single('image'), AdminController.updateAdminDetails);
router.put("/admin-password",verifyAdminJWT(), AdminController.updateAdminPassword);
router.post("/get-admins", verifyAdminJWT(), AdminController.fetchAdmin);
router.put("/update-admin/:id", verifyAdminJWT(2), AdminController.updateAdmin);
router.put("/deactivate-admin/:id", verifyAdminJWT(2), AdminController.deactivateAdmin);
router.put("/restore-admin/:id", verifyAdminJWT(2), AdminController.restoreAdmin);


// Category
router.post("/categories/create", upload.single('image'), verifyAdminJWT(1), CategoryController.createCategory);
router.post("/categories/create-with-subcategories", verifyAdminJWT(), CategoryController.createCategoryWithSubcategories);
router.get("/categories", verifyAdminJWT(), CategoryController.getAllCategories);
router.get("/categories/:id", verifyAdminJWT(), requireValidObjectId("id"), CategoryController.getCategoryById);
router.put("/categories/:id", verifyAdminJWT(1), requireValidObjectId("id"), upload.single('image'), CategoryController.updateCategory);
router.delete("/categories/deleteAll", verifyAdminJWT(), CategoryController.deleteAllCategories);
router.delete("/categories/:id", verifyAdminJWT(1), requireValidObjectId("id"), CategoryController.softDeleteCategory);
router.patch("/categories/:id/restore", verifyAdminJWT(1), requireValidObjectId("id"), CategoryController.restoreCategory);


// SubCategory
router.post("/subcategories/create", verifyAdminJWT(1), upload.single('image'), SubcategoryController.createSubcategory);
router.get("/subcategories", verifyAdminJWT(), SubcategoryController.getAllSubcategories);
router.get("/subcategories/:id", verifyAdminJWT(), requireValidObjectId("id"), SubcategoryController.getSubcategoryById);
router.put("/subcategories/:id", verifyAdminJWT(1), requireValidObjectId("id"), upload.single('image'), SubcategoryController.updateSubcategory);
router.delete("/subcategories/deleteAll", verifyAdminJWT(2), SubcategoryController.deleteAllSubcategories);
router.delete("/subcategories/:id", verifyAdminJWT(1), requireValidObjectId("id"), SubcategoryController.softDeleteSubcategory);
router.patch("/subcategories/:id/restore", verifyAdminJWT(1), requireValidObjectId("id"), SubcategoryController.restoreSubcategory);

// POST ROUTES
router.post("/search-post", verifyAdminJWT(), PostController.adminSearch);
router.get('/single-post/:postId', verifyAdminJWT(), PostController.read);
router.put("/deactivate-post/:postId", verifyAdminJWT(1), PostController.deactivatePost);
router.get("/get-post-stats", verifyAdminJWT(), PostController.getPostStatsByCategory);


//USER ROUTES
router.post("/get-users", verifyAdminJWT(), UserController.getUsers);
router.get("/single-user/:id", verifyAdminJWT(), UserController.getUserDetails);
router.put("/deactivate-user/:id", verifyAdminJWT(1), UserController.deactivateUser);

// DASHBOARD
router.get("/dashboard-data", verifyAdminJWT(), AdminController.getDashBoardData);

//REPORTS
router.post("/get-reports", verifyAdminJWT(), getReports);

//DEACTIVATED DATA
router.get("/deactivated-data", verifyAdminJWT(), AdminController.getDeactivatedData);

module.exports = router;


