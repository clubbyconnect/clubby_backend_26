const express = require('express');
const router = express.Router();
const upload = require("../middleware/multer.js")
const { verifyJWT } = require("../middleware/auth.js")
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
  sendClubRequest,
  acceptClubRequest,
  declineClubRequest,
  UpdateUserDetails,
  removeUserFromClub,
  sendOtpToVerifyMobileNumber,
  verifyOtpToVerfiyMobileNumber,
  UpdateUserLikePost,
  getUserLikePost,
  getPost,
  isConnected,
  fetchGroupMembers,
  getCategoryName
} = require('../controllers/user.controller.js');
const { sendPushNotification,
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

const CategoryController = require('../controllers/CategoryController.js');


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
  createPost,
  removeUserFromGroup,
  getFirst4MediaMessages,
  getAllMediaMessages,
  wrapDeal,
  createReport,
  getAllReports,
  getGroupDetails

  // filterUserPosts
} = require("../controllers/user.controller.js");


const PostController = require("../controllers/PostController.js");
const ClubRequestController = require("../controllers/ClubRequestController.js");
const GroupController = require("../controllers/GroupController.js");
const FileController = require("../controllers/FileController.js");


// // Image Upload
router.post("/image-upload", verifyJWT, upload.single("image"), FileController.image);
//user
router.post("/signUp", signUp);
router.post("/googleAuth", googleAuth);
router.post("/appleAuth", appleAuth);
router.post("/facebookAuth", facebookAuth);
router.post("/signIn", signIn);
router.post("/sendOtp", sendOtp);
router.post("/sendOtpToVerifyMobileNumber", verifyJWT, sendOtpToVerifyMobileNumber);
router.post("/verifyOtpToVerfiyMobileNumber", verifyJWT, verifyOtpToVerfiyMobileNumber);
router.post("/verifyOtp", verifyOtp);
router.post("/logout", verifyJWT, logout);
router.post("/resetPassword", resetPassword);
router.post("/uploadAvatar", verifyJWT, upload.single('avatar'), uploadAvatar);

// POST ROUTES
router.post("/post/create", verifyJWT, upload.single('productImage'), PostController.create);
router.get('/post/:productId', verifyJWT, PostController.read)
router.put("/post/:postId", verifyJWT, upload.single('productImage'), PostController.update);
router.delete("/post/:postId", verifyJWT, PostController.delete)
router.post("/post/transfer", verifyJWT, PostController.transfer);
// NOTE: ALI, SONALI - Update the search posts functionality. with deletedAt and category name in the search results.
router.post("/search-posts", verifyJWT, PostController.getPost);

// router.delete("/deletePost",verifyJWT,deletePost)
router.post("/createPost", verifyJWT, upload.single('productImage'), createPost);
//router.get('/productDetails/:productId',verifyJWT,getProductDetails)


// CLUB ROUTES
router.get("/club/:productId", verifyJWT, ClubRequestController.list);
router.get("/club/join/:postId", verifyJWT, ClubRequestController.sendClubRequest);
router.post("/club-request/action", verifyJWT, ClubRequestController.handleClubRequest);



// GROUP ROUTES
router.get("/group/member/:postId", verifyJWT, GroupController.member);


router.post("/UpdateUserDetails", verifyJWT, upload.single('avatar'), UpdateUserDetails);
router.post("/UpdateUserLikePost", verifyJWT, UpdateUserLikePost);
router.get("/getUserLikePost", verifyJWT, getUserLikePost);
router.get("/getPost", verifyJWT, getPost);

//App data
//router.post("/fetchallcategory",sendPushNotification);
//router.post("/fetchallcategory",verifyJWT, fetchallcategory);
router.post("/fetchallcategory", verifyJWT, CategoryController.getAllCategories);
router.post("/fetchsubcategory", verifyJWT, fetchsubcategory);
router.post("/fetchOfflinecategory", verifyJWT, fetchOfflinecategory);
router.post("/fetchOnlinecategory", verifyJWT, fetchOnlinecategory);

//serch & filter
//getAllProducts
router.get("/getAllProducts", verifyJWT, getAllProducts);

router.get("/serchByProductName", searchByProductName);
router.get("/searchByDistance", searchByDistance);
router.get("/searchByGender", searchByGender);
router.get("/searchByDate", searchByDate);
router.get("/searchByFilter", searchByFilter);
router.get("/searchBySort", searchBySort);
router.get("/searchProducts", verifyJWT, searchProducts);

//testing searchProducts
router.get("/unifiedSearch", unifiedSearch);

//clubRequest
router.post("/sendClubRequest", verifyJWT, sendClubRequest);
router.post("/acceptClubRequest", verifyJWT, acceptClubRequest);
router.post("/declineClubRequest", verifyJWT, declineClubRequest);
router.post("/removeUserFromClub", verifyJWT, removeUserFromClub);

router.post("/isConnected", verifyJWT, isConnected)
router.post("/fetchGroupMembers", fetchGroupMembers)

router.get("/categoryname/:categoryId", getCategoryName);

//---------------------chat Routes-------------------------------------------------
//Group Message

//http://localhost:8000/api/user/myGroups

router.post("/joinGroup", createOrJoinGroup);
router.post("/leaveGroupRequest", leaveGroup);

router.get("/myGroups/:userId", getGroupsForUser);

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

router.post("/markMessageAsRead", verifyJWT, markMessageAsRead);

router.get("/getMessages/:groupId", getMessagesForGroup);

router.get("/getAdminUser/:groupId", getGroupMembersAndAdmin);
router.get("/getGroupDetails/:groupId", getGroupDetails)
router.post("/sendSystemMessage", sendSystemMessage);

router.post("/addToFav", verifyJWT, addToFavourites);


router.get("/getFavoriteProducts", verifyJWT, getFavoriteProducts);
router.get("/getFilteredFavoriteProducts", verifyJWT, getFilteredFavoriteProducts);

router.get("/getUserPosts", verifyJWT, getUserPosts);

router.post("/castVote", castVote);

router.post("/removeUserFromGroup", removeUserFromGroup);

router.get("/getSortmedia/:groupId", getFirst4MediaMessages);
router.get("/getAllMediaMessages/:groupId", getAllMediaMessages);

router.post("/wrapDeal", wrapDeal);
router.post("/createReport", createReport);
router.get("/getAllReports", getAllReports);





module.exports = router;
