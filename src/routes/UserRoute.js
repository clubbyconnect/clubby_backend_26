const express = require('express');
const router = express.Router();
const upload = require("../middleware/multer.js")
const { verifyJWT } = require("../middleware/auth.js")
const {
  uploadAvatar,
  UpdateUserDetails,
} = require("../controllers/UserInfoController.js")
const {
  signUp,
  googleAuth,
  appleAuth,
  facebookAuth,
  signIn,
  logout,
  resetPassword,
} = require('../controllers/AuthController.js')
const {
  sendOtp,
  verifyOtp,
  sendOtpToVerifyMobileNumber,
  verifyOtpToVerfiyMobileNumber,
} = require("../controllers/SmsOtp.js")


const {
  addToFavourites,
  getFilteredFavoriteProducts,
} = require("../controllers/FavouriteController.js");
const {
  getUserPosts,
} = require("../controllers/MyPostController.js");
const {
  getFirst4MediaMessages,
  getAllMediaMessages,
  wrapDeal,
  createReport,
  removeUserFromGroup,
  getAllReports,
} = require("../controllers/GroupProfileController.js")
const {
  createOrJoinGroup,
  leaveGroup,
  getGroupMembersAndAdmin,
  getGroupDetails,
  isConnected,
  getGroupsForUser,
  groupMember
} = require("../controllers/GroupController.js")

const {
  getNotifications, getUnreadCount, readOneNotification
} = require("../controllers/NotificationController.js")


const { startCall, endCall, joinCall, leaveCall, trackCallStart, trackJoinCall } = require("../controllers/CallController.js")

const {
  sendMessage,
  getMessagesForGroup,
  sendSystemMessageHandler,
  markMessageAsRead,
} = require("../controllers/MessageController.js")

const PostController = require("../controllers/PostController.js");
const ClubRequestController = require("../controllers/ClubRequestController.js");
const FileController = require("../controllers/FileController.js");
const CategoryController = require('../controllers/CategoryController.js');
const SubcategoryController = require("../controllers/SubCategoryController.js")

router.post("/image-upload", verifyJWT, upload.single("image"), FileController.image);
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

// POST ROUTES 123
router.post("/post/create", verifyJWT, upload.single('productImage'), PostController.create);
router.get('/post/:productId', verifyJWT, PostController.read)
router.put("/post/:postId", verifyJWT, upload.single('productImage'), PostController.update);
router.delete("/post/:postId", verifyJWT, PostController.delete)
router.post("/post/transfer", verifyJWT, PostController.transfer)
router.get("/searchProducts", verifyJWT, PostController.search);

// CLUB ROUTES
router.get("/club/:productId", verifyJWT, ClubRequestController.list);
router.get("/club/join/:postId", verifyJWT, ClubRequestController.sendClubRequest);
router.post("/club-request/action", verifyJWT, ClubRequestController.handleClubRequest);



// GROUP ROUTES
router.get("/group/member/:postId", verifyJWT, groupMember);
router.post("/UpdateUserDetails", verifyJWT, upload.single('avatar'), UpdateUserDetails);


router.post("/fetchallcategory", verifyJWT, CategoryController.getAllCategories);
router.post("/fetchOfflinecategory", verifyJWT, CategoryController.getAllCategories);
router.post("/fetchOnlinecategory", verifyJWT, CategoryController.onlineDiscontinued);
router.post("/fetchsubcategory", verifyJWT, SubcategoryController.fetchsubcategory);



router.post("/isConnected", verifyJWT, isConnected)
router.get("/categoryname/:categoryId", CategoryController.getCategoryName);

//--------------------Group chat Routes-------------------------------------------------

router.post("/joinGroup", verifyJWT, createOrJoinGroup);
router.post("/leaveGroupRequest", verifyJWT, leaveGroup);
router.post("/myGroups", verifyJWT, getGroupsForUser);

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
router.get("/getMessages/:groupId", verifyJWT, getMessagesForGroup);
router.get("/getAdminUser/:groupId", getGroupMembersAndAdmin);
router.get("/getGroupDetails/:groupId", getGroupDetails)
router.post("/sendSystemMessage", sendSystemMessageHandler);


//Favourite
router.post("/addToFav", verifyJWT, addToFavourites);
router.get("/getFilteredFavoriteProducts", verifyJWT, getFilteredFavoriteProducts);

//My POST
router.get("/getUserPosts", verifyJWT, getUserPosts);

//Group Profile
router.post("/removeUserFromGroup", verifyJWT, removeUserFromGroup);
router.get("/getSortmedia/:groupId", verifyJWT, getFirst4MediaMessages);
router.get("/getAllMediaMessages/:groupId", verifyJWT, getAllMediaMessages);
router.post("/wrapDeal", verifyJWT, wrapDeal);
router.post("/createReport", verifyJWT, createReport);
router.get("/getAllReports", verifyJWT, getAllReports);



//Notifications
router.get("/getAllNoti", verifyJWT, getNotifications);
router.get("/getNotiReadCount", verifyJWT, getUnreadCount);
router.patch("/readNoti/:notificationId", verifyJWT, readOneNotification);

//startCall, endCall, joinCall,leaveCall
router.post("/startCall", verifyJWT, startCall);
router.post("/endCall", verifyJWT, endCall);
router.post("/joinCall", verifyJWT, joinCall);
router.post("/leaveCall", verifyJWT, leaveCall);
router.post("/trackCallStart", verifyJWT, trackCallStart);
router.post("/trackJoinCall", verifyJWT, trackJoinCall);


module.exports = router;
