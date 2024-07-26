const express = require('express');
const router = express.Router();
const { 
     createCategory,
     addSubcategory,
     deleteCategory,
     findCategoryWithSubcategories,
     deleteUser
    } = require('../controllers/admin.controllers.js');

//admin
router.post("/createCategory",createCategory);
router.post("/addSubcategory",addSubcategory);
router.post("/deleteCategory",deleteCategory);
router.post("/findCategoryWithSubcategories",findCategoryWithSubcategories);
router.post("/deleteUser",deleteUser);

module.exports = router;

