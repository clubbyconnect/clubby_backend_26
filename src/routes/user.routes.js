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
    UpdateUserDetails,
    removeUserFromClub,
    sendOtpToVerifyMobileNumber,
    verifyOtpToVerfiyMobileNumber
} = require('../controllers/user.controller.js');
const { sendPushNotification,
    fetchallcategory,
    fetchsubcategory,
    fetchOfflinecategory,
    fetchOnlinecategory
} = require('../controllers/data.controller.js');

//user
router.post("/signUp",signUp);
router.post("/googleAuth",googleAuth); 
router.post("/appleAuth",appleAuth);
router.post("/facebookAuth",facebookAuth);
router.post("/signIn",signIn); 
router.post("/sendOtp",sendOtp);
router.post("/sendOtpToVerifyMobileNumber",verifyJWT,sendOtpToVerifyMobileNumber);
router.post("/verifyOtpToVerfiyMobileNumber",verifyJWT,verifyOtpToVerfiyMobileNumber);
router.post("/verifyOtp",verifyOtp);
router.post("/logout",verifyJWT,logout);
router.post("/resetPassword",resetPassword);
router.post("/uploadAvatar",verifyJWT ,upload.single('avatar'),uploadAvatar);
router.post("/createPost",verifyJWT,upload.single('productImage') ,createPost);
router.post("/UpdateUserDetails",verifyJWT,upload.single('avatar') ,UpdateUserDetails);

//App data
//router.post("/fetchallcategory",sendPushNotification);
router.post("/fetchallcategory",verifyJWT,fetchallcategory);
router.post("/fetchsubcategory",verifyJWT,fetchsubcategory);
router.post("/fetchOfflinecategory",fetchOfflinecategory);
router.post("/fetchOnlinecategory",fetchOnlinecategory);

//clubRequest
router.post("/sendClubRequest",verifyJWT,sendClubRequest);
router.post("/acceptClubRequest",verifyJWT,acceptClubRequest);
router.post("/declineClubRequest",verifyJWT,declineClubRequest);
router.post("/removeUserFromClub",verifyJWT,removeUserFromClub);


module.exports = router;
