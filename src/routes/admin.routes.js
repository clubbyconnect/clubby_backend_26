const express = require('express');
const router = express.Router();
const { 
     createCategory,
     addSubcategory,
     deleteCategory,
     findCategoryWithSubcategories,
     chat
    } = require('../controllers/admin.controllers.js');

//admin
router.post("/createCategory",createCategory);
router.post("/addSubcategory",addSubcategory);
router.post("/deleteCategory",deleteCategory);
router.post("/findCategoryWithSubcategories",findCategoryWithSubcategories);
router.post("/chat",chat);


module.exports = router;

