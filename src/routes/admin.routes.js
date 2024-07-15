const express = require('express');
const router = express.Router();

const { createChatRoomID,
     createCategory,
     addSubcategory,
     deleteCategory,
     findCategoryWithSubcategories
    } = require('../controllers/admin.controllers.js');

//admin


router.post("/createChatRoomID",createChatRoomID);


router.post("/createCategory",createCategory);
router.post("/addSubcategory",addSubcategory);
router.post("/deleteCategory",deleteCategory);
router.post("/findCategoryWithSubcategories",findCategoryWithSubcategories);


module.exports = router;

