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
    verifyOtpToVerfiyMobileNumber,
    UpdateUserLikePost,
    getUserLikePost,
    getPost
} = require('../controllers/user.controller.js');
const { sendPushNotification,
  fetchallcategory,
  fetchsubcategory,
  fetchOfflinecategory,
  fetchOnlinecategory,
  searchByProductName,
  searchByDistance,
  searchByGender,
  searchByDate,
  searchByFilter,
  searchBySort,
  unifiedSearch,
  getAllProducts,
  searchProducts
} = require('../controllers/data.controller.js');


const {
  createOrJoinGroup,
  leaveGroup,
  castVote,
  getGroupsForUser,
  sendMessage,
  getMessagesForGroup,
  sendSystemMessage,
  getGroupMembersAndAdmin,
  markMessageAsRead,
  addToFavourites,
  getFavoriteProducts,
  getFilteredFavoriteProducts,
  getUserPosts,
  filterUserPosts
} = require("../controllers/user.controller.js");

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
router.post("/UpdateUserLikePost",verifyJWT,UpdateUserLikePost);
router.get("/getUserLikePost",verifyJWT,getUserLikePost);
router.get("/getPost",verifyJWT,getPost);

//App data
//router.post("/fetchallcategory",sendPushNotification);
router.post("/fetchallcategory", verifyJWT, fetchallcategory);
router.post("/fetchsubcategory", verifyJWT, fetchsubcategory);
router.post("/fetchOfflinecategory", fetchOfflinecategory);
router.post("/fetchOnlinecategory", fetchOnlinecategory);

//serch & filter
//getAllProducts
router.get("/getAllProducts", getAllProducts);

router.get("/serchByProductName", searchByProductName);
router.get("/searchByDistance", searchByDistance);
router.get("/searchByGender", searchByGender);
router.get("/searchByDate", searchByDate);
router.get("/searchByFilter", searchByFilter);
router.get("/searchBySort", searchBySort);
router.get("/searchProducts", searchProducts);

//testing searchProducts
router.get("/unifiedSearch", unifiedSearch);

//clubRequest
router.post("/sendClubRequest", verifyJWT, sendClubRequest);
router.post("/acceptClubRequest", verifyJWT, acceptClubRequest);
router.post("/declineClubRequest", verifyJWT, declineClubRequest);
router.post("/removeUserFromClub", verifyJWT, removeUserFromClub);


//---------------------chat Routes-------------------------------------------------
//Group Message

//http://localhost:8000/api/user/myGroups

// Route to create a new group/join group
router.post("/joinGroup", createOrJoinGroup);
// Route to leave a group with voting logic
router.post("/leaveGroupRequest", leaveGroup);
// Route to get all groups a user is part of
router.get("/myGroups/:userId", getGroupsForUser);
// Route to send a message in the group
// router.post("/sendMessage", verifyJWT, upload.single('image'), sendMessage);
router.post(
  "/sendMessage",
  verifyJWT,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]),
  sendMessage
);

// Route to read the message
router.post("/markMessageAsRead", verifyJWT, markMessageAsRead);

// Route to get messages for a specific group
router.get("/getMessages/:groupId", getMessagesForGroup);
//Route to get userlist and admin for a specific group
router.get("/getAdminUser/:groupId", getGroupMembersAndAdmin);

//system message
router.post("/sendSystemMessage", sendSystemMessage);

router.post("/addToFav", verifyJWT, addToFavourites);

//getFavoriteProducts
router.get("/getFavoriteProducts", verifyJWT, getFavoriteProducts);
//getFilteredFavoriteProducts
router.get("/getFilteredFavoriteProducts", verifyJWT, getFilteredFavoriteProducts);
//getUserPosts
router.get("/getUserPosts", verifyJWT, getUserPosts);
//filterUserPosts
router.get("/filterUserPosts", verifyJWT, filterUserPosts);

// Route for admin to leave the group
router.post("/castVote", castVote);

module.exports = router;
