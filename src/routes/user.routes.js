
// user.Routes.js
const express = require('express');
const router = express.Router();
const upload = require("../middleware/multer.js")
const {verifyJWT} = require("../middleware/auth.js")
const { signUp, 
    googleAuth, 
    appleAuth, 
    facebookAuth, 
    signIn, 
    sendOtp, 
    verifyOtp,
    logout, 
    resetPassword,
    uploadAvatar,
    createPost,
    sendClubRequest,
    acceptClubRequest,
    declineClubRequest,
    UpdateUserDetails
} = require('../controllers/user.controller.js');
const { fetchallcategory,
    fetchsubcategory,
} = require('../controllers/data.controller.js');

//user
router.post("/signUp",signUp);
router.post("/googleAuth",googleAuth); 
router.post("/appleAuth",appleAuth);
router.post("/facebookAuth",facebookAuth);
router.post("/signIn",signIn); 
router.post("/sendOtp",sendOtp);
router.post("/verifyOtp",verifyOtp);
router.post("/logout",verifyJWT,logout);
router.post("/resetPassword",resetPassword);
router.post("/uploadAvatar",verifyJWT ,upload.single('avatar'),uploadAvatar);
router.post("/createPost",verifyJWT,upload.single('productImage') ,createPost);
router.post("/UpdateUserDetails",verifyJWT,upload.single('avatar') ,UpdateUserDetails);

//App data
router.post("/fetchallcategory",verifyJWT,fetchallcategory);
router.post("/fetchsubcategory",verifyJWT,fetchsubcategory);

//clubRequest
router.post("/sendClubRequest",verifyJWT,sendClubRequest);
router.post("/acceptClubRequest",verifyJWT,acceptClubRequest);
router.post("/declineClubRequest",verifyJWT,declineClubRequest);



module.exports = router;
