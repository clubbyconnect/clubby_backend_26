const express = require('express');
const router = express.Router();
const {
     createCategory,
     createOfflineCategory,
     createOnlineCategory,
     addOfflineSubcategory,
     addOnlineSubcategory,
     addSubcategory,
     deleteCategory,
     findCategoryWithSubcategories,
     deleteUser
} = require('../controllers/admin.controllers.js');

const CategoryController = require('../controllers/CategoryController.js');
const SubcategoryController = require("../controllers/SubcategoryController");

// Category
router.post("/categories/create",CategoryController.createCategory);
router.post("/categories/create-with-subcategories",CategoryController.createCategoryWithSubcategories);
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

//admin
router.post("/createCategory",createCategory);
router.post("/createOfflineCategory",createOfflineCategory);
router.post("/addOfflineSubcategory",addOfflineSubcategory);
router.post("/createOnlineCategory",createOnlineCategory);
router.post("/addOnlineSubcategory",addOnlineSubcategory);
router.post("/addSubcategory",addSubcategory);
router.post("/deleteCategory",deleteCategory);
router.post("/findCategoryWithSubcategories",findCategoryWithSubcategories);
router.post("/deleteUser",deleteUser);

module.exports = router;

