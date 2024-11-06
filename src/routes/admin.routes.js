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

