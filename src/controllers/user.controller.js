const otpGenerator = require("otp-generator");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const Facebook = require("facebook-node-sdk");
const { appleAuth } = require("apple-auth");
const uploadOnCloudinary = require("../utils/cloudinary.js");
const serverErrorHandler = require("../utils/serverErrorHandler.js");
const User = require("../models/user.js");
const OTP = require("../models/otp.js");
const post = require("../models/post.js");
const OfflineCategoryModel = require("../models/offlineCategorySchema.js");
const onlineCategoryModel = require("../models/onlineCategorySchema.js");
const CategoryModel = require("../models/categorySchema.js");
const ClubRequest = require("../models/clubRequest.js");
const ChatRoom = require("../models/chatRoom.js");

// Fast2SMS Configuration-----------------------------------
const fast2SMSapiKey = process.env.FAST2SMS_API_KEY;
const fast2SMSurl = process.env.FAST2SMS_URL;

// OAuth 2.0 Configuration-----------------------------------
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const fb = new Facebook({
  appId: process.env.FACEBOOK_APP_ID,
  secret: process.env.FACEBOOK_APP_SECRET,
});

//Exclude Fields in Response--------------------------------------------
const excludeField =
  "-password -refreshToken -UserRating -homelocationChangeCount -lastHomelocationChange -emailChangeCount -lastEmailChange -phoneNumberChangeCount -lastPhoneNumberChange -googleAuthId -blockedUsers -reportCount -refreshToken";

//Custom Methods-----------------------------------
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    return {
      error: "Something went wrong while generating refresh and access tokens",
    };
  }
};
const generateUniqueOtp = async () => {
  let otp;
  let result;
  do {
    otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });
    result = await OTP.findOne({ otp });
  } while (result);
  return otp;
};
const sendSms = async (phoneNumber, message) => {
  const fast2SMSurl = "https://www.fast2sms.com/dev/bulkV2";
  const fast2SMSapiKey =
    "Zivh0PV87e5sDAcJ3ty6Q4gK9pXx21UjkWnHaSqTFoMfGIuRrYWtOBVjknIQTSeg2AJsv5FchYK4PN17";

  try {
    const response = await axios.get(fast2SMSurl, {
      params: {
        authorization: fast2SMSapiKey,
        route: "otp",
        variables_values: message,
        numbers: phoneNumber,
        flash: "0",
      },
    });
  } catch (error) {}
};

// controllers-----------------------------------
exports.signUp = async (req, res) => {
  try {
    const { email, confirmPassword, password } = req.body;

    if (
      [confirmPassword, email, password].some((field) => field?.trim() === "")
    ) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const googleAuthError =
        "You are already registered with Google Email-id, please sign in with Google";
      const userExistsError = "User with this email already exists";

      return res.status(409).json({
        error:
          existingUser.googleAuthId !== null
            ? googleAuthError
            : userExistsError,
      });
    }

    const newUser = await User.create({ email, password });
    const user = await User.findById(newUser._id).select("email");

    if (!user) {
      return res
        .status(500)
        .json({ error: "Something went wrong while registering the user" });
    }
    return res
      .status(200)
      .json({ message: "User registered successfully", data: user });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    const result = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const googleAuthId = result.payload.sub;
    const email = result.payload.email;
    let user = await User.findOne({ googleAuthId });

    if (!user) {
      const newUser = await User.create({ email, googleAuthId });
      user = await User.findById(newUser._id).select("-password -refreshToken");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );
    const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    const options = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json({
        message: user
          ? "User signed in successfully"
          : "User Created and signed in successfully",
        data: loggedInUser,
      });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.appleAuth = async (req, res) => {
  try {
    const { idToken, user } = req.body;
    const userInfo = await appleAuth.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: true,
    });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.facebookAuth = async (req, res) => {
  try {
    const { accessToken } = req.body;

    fb.api("/me", { access_token: accessToken }, (response) => {
      if (!response || response.error) {
        return res
          .status(400)
          .json({ error: "Failed to fetch user details from Facebook." });
      }

      return res.json({
        message: "User signed up successfully using Facebook!",
      });
    });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.signIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User does not exist" });
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid user credentials" });
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );
    const loggedInUser = await User.findById(user._id).select(
      `${excludeField}`
    );
    const options = {
      httpOnly: true,
      secure: true,
    };

    res.cookie("accessToken", accessToken, options);
    res.cookie("refreshToken", refreshToken, options);
    return res
      .status(200)
      .json({ message: "User signed in successfully", data: loggedInUser });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const { contact } = req.body;

    if (!contact || contact.trim() === "") {
      return res
        .status(400)
        .json({ error: "Email or phone number is required" });
    }

    const Email = /\S+@\S+\.\S+/.test(contact);
    const userQuery = Email ? { email: contact } : { phoneNumber: contact };

    const user = await User.findOne(userQuery);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isEmail = user.email === contact;
    const otp = await generateUniqueOtp();

    const otpPayload = isEmail
      ? { email: contact, otp }
      : { phoneNumber: contact, otp };
    await OTP.create(otpPayload);

    if (isEmail) {
      return res
        .status(200)
        .json({ success: true, message: "OTP Sent Successfully" });
    } else {
      const message = otp;
      await sendSms(contact, message);
      return res
        .status(200)
        .json({ success: true, message: "OTP Sent Successfully" });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.sendOtpToVerifyMobileNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(200).json({ message: "Phone number already exist" });
    }

    const existingOtp = await OTP.findOne({ phoneNumber });

    if (existingOtp) {
      return res
        .status(400)
        .json({ error: "OTP already sent pls try after some time" });
    }

    const otp = await generateUniqueOtp();

    const otpPayload = { phoneNumber, otp };
    await OTP.create(otpPayload);

    const message = otp;
    await sendSms(phoneNumber, message);
    return res.status(200).json({ message: "OTP Sent Successfully" });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.verifyOtpToVerfiyMobileNumber = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res
        .status(400)
        .json({ error: "phoneNumber and OTP are required" });
    }

    const user = await OTP.findOne({ phoneNumber });

    if (!user) {
      return res.status(400).json({ error: "OTP expierd" });
    }

    const otpRecord = await OTP.findOne({ phoneNumber, otp });

    if (otpRecord) {
      const userId = req.User._id;
      let updateDetails = await User.findById(userId);
      if (phoneNumber) updateDetails.phoneNumber = phoneNumber.trim();
      updateDetails.phoneNumberVerified = true;
      updateDetails = await updateDetails.save();

      return res.status(200).json({ message: "OTP verified successfully" });
    } else {
      return res.status(400).json({ error: "Invalid OTP" });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { contact, otp } = req.body;

    if (!contact || !otp) {
      return res.status(400).json({ error: "Contact and OTP are required" });
    }

    const user = await OTP.findOne({
      $or: [{ email: contact }, { phoneNumber: contact }],
    });

    if (!user) {
      return res.status(400).json({ error: "OTP expierd" });
    }

    const query =
      user.email === contact
        ? { email: contact, otp }
        : { phoneNumber: contact, otp };
    const otpRecord = await OTP.findOne(query);

    if (otpRecord) {
      return res.status(200).json({ message: "OTP verified successfully" });
    } else {
      return res.status(400).json({ error: "Invalid OTP" });
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(
      req.User._id,
      { $unset: { refreshToken: 1 } },
      { new: true }
    );

    const cookieOptions = { httpOnly: true, secure: true };

    return res
      .status(200)
      .clearCookie("accessToken", cookieOptions)
      .clearCookie("refreshToken", cookieOptions)
      .json({ message: "User logged out successfully" });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { contact, confirmPassword, newPassword } = req.body;

    if (!contact || contact.trim() === "") {
      return res
        .status(400)
        .json({ error: "Email or phone number is required" });
    }

    const isEmail = /\S+@\S+\.\S+/.test(contact);

    const user = await User.findOne(
      isEmail ? { email: contact } : { phoneNumber: contact }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.googleAuthId !== null) {
      return res.status(403).json({
        error:
          "You are registered with Google ID and cannot reset your password",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });
    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    const avatarLocalPath = req.file?.path;
    if (!avatarLocalPath) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if (!avatar) {
      return res.status(500).json({ error: "Unable to upload profile photo" });
    }

    const user = await User.findByIdAndUpdate(
      req.User?._id,
      { $set: { avatar: avatar.url } },
      { new: true }
    ).select(`${excludeField}`);

    return res
      .status(200)
      .json({ message: "Avatar uploaded successfully", data: user });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Unable to upload avatar. Server error!" });
  }
};

exports.createPost = async (req, res) => {
  try {
    const {
      clubType,
      category,
      subCategory,
      itemName,
      offerType,
      price,
      price_type,
      clubMembers,
      store_location_latitude,
      store_location_longitude,
      additionalInformation,
      size,
      itemLink,
      platform,
      delivery_location_latitude,
      delivery_location_longitude,
      paymentMode,
    } = req.body;

    if (
      [
        clubType,
        category,
        subCategory,
        itemName,
        offerType,
        price,
        price_type,
        clubMembers,
      ].some((field) => !field || field.trim() === "")
    ) {
      return res.status(400).json({ error: "Please fill all required fields." });
    }

    if (clubType === "offline") {
      if (
        !store_location_latitude ||
        !store_location_longitude ||
        store_location_longitude.trim() === ""
      ) {
        return res
          .status(400)
          .json({ error: "Offline category type requires a store location." });
      }
    } else if (clubType === "online") {
      if (
        !platform ||
        !itemLink ||
        !delivery_location_latitude ||
        !delivery_location_longitude ||
        !paymentMode ||
        [
          platform,
          itemLink,
          delivery_location_latitude,
          delivery_location_longitude,
          paymentMode,
        ].some((field) => field.trim() === "")
      ) {
        return res.status(400).json({
          error:
            "Online posts require an item link, platform, delivery location, and payment mode.",
        });
      }
    } else {
      return res.status(400).json({ error: "Invalid club type." });
    }

    const productImageLocalPath = req.file?.path;

    if (!productImageLocalPath) {
      return res.status(400).json({ error: "Product Image is required." });
    }

    const productImage = await uploadOnCloudinary(productImageLocalPath);

    const CategoryClubType =
      clubType === "offline" ? OfflineCategoryModel : onlineCategoryModel;

    const categoryObj = await CategoryClubType.findOne({ name: category });
    if (!categoryObj)
      return res.status(400).json({ error: "Invalid category." });

    const subcategoryObj = await CategoryClubType.findOne({
      name: subCategory,
    });
    if (!subcategoryObj)
      return res.status(400).json({ error: "Invalid subcategory." });

    const postData = {
      userId: req.User._id,
      itemName,
      offerType,
      price,
      price_type,
      clubMembers,
      category: categoryObj._id,
      subCategory: subcategoryObj._id,
      productImage: productImage.url,
      clubType,
    };

    if (size) postData.size = size;
    if (additionalInformation)
      postData.additionalInformation = additionalInformation;

    if (clubType === "offline") {
      postData.store_location_latitude = store_location_latitude;
      postData.store_location_longitude = store_location_longitude;
    } else if (clubType === "online") {
      postData.itemLink = itemLink;
      postData.platform = platform;
      postData.delivery_location_latitude = delivery_location_latitude;
      postData.delivery_location_longitude = delivery_location_longitude;
      postData.paymentMode = paymentMode;
    }

    const createdPost = await post.create(postData);
    if (!createdPost._id)
      return res.status(500).json({ error: "Unable to create post." });

    const populatedPost = await post
      .findById(createdPost._id)
      .populate("category", "name")
      .populate("subCategory", "name");

    return res.status(200).json({
      message: "Post created successfully.",
      post: {
        ...populatedPost._doc,
        category: populatedPost.category.name,
        subCategory: populatedPost.subCategory.name,
      },
    });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.UpdateUserDetails = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      gender,
      password,
      email,
      phoneNumber,
      userName,
      birthdate,
    } = req.body;
    const userId = req.User._id;

    let updateDetails = await User.findById(userId);

    const avatarLocalPath = req.file?.path;
    if (avatarLocalPath) {
      const avatar = await uploadOnCloudinary(avatarLocalPath);
      if (!avatar) {
        return res.status(400).json({ error: "Unable to upload avatar" });
      }
      updateDetails.avatar = avatar.secure_url;
    }

    if (userName) {
      isUserNameExist = await User.findOne({ userName });

      if (isUserNameExist) {
        return res.status(404).json({ error: "userName Already exist" });
      }
      updateDetails.userName = userName.trim();
    }

    if (firstName) updateDetails.firstName = firstName.trim();
    if (lastName) updateDetails.lastName = lastName.trim();
    if (gender) updateDetails.gender = gender.trim();
    if (email) updateDetails.email = email.trim();
    if (phoneNumber) updateDetails.phoneNumber = phoneNumber.trim();

    if (birthdate) {
      const parsedBirthdate = new Date(birthdate);
      if (parsedBirthdate > new Date()) {
        return res
          .status(400)
          .json({ error: "Birthdate cannot be in the future" });
      }
      updateDetails.birthdate = parsedBirthdate;
    }

    updateDetails = await updateDetails.save();
    let updateUser = await User.findById(userId).select(`${excludeField}`);

    return res.status(200).json({
      message: "User details updated successfully",
      data: updateUser,
    });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};
//------------------------------------------User Request---------------------------------------------
exports.sendClubRequest = async (req, res) => {
  try {
    const { postId } = req.body;
    const requesterId = req.User._id;

    const postData = await post.findById(postId);
    if (!postData) {
      return res.status(404).json({ error: "Post Not Found" });
    }

    if (postData.userId.equals(requesterId)) {
      return res
        .status(404)
        .json({ error: "You can not send ClubRequest to your own Post" });
    }
    const recipientId = postData.userId;

    if (!requesterId || !recipientId) {
      return res.status(404).json({ error: "User not found" });
    }

    const existingRequest = await ClubRequest.findOne({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    if (existingRequest) {
      return res.status(400).json({ error: "Club request already sent" });
    }

    const friendRequest = await ClubRequest.create({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    await friendRequest.save();
    return res.status(200).json({ message: "Club request sent" });
  } catch (error) {
    return res.status(500).json({ error: "Error sending Club request", error });
  }
};

exports.acceptClubRequest = async (req, res) => {
  try {
    const { requesterId, postId } = req.body;
    const recipientId = req.User._id;

    const postData = await post.findById(postId);
    if (!postData) {
      return res.status(404).json({ error: "Post Not Found" });
    }

    if (postData.userId.equals(requesterId)) {
      return res.status(400).json({
        message:
          "You cannot use your userId as requesterId to Accept ClubRequest",
      });
    }

    const requester = await User.findById(requesterId);
    if (!requester) {
      return res.status(404).json({ error: "Requester Not Found" });
    }

    const pendingRequest = await ClubRequest.findOne({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    if (!pendingRequest) {
      return res.status(400).json({ error: "Pending Request Not Found" });
    }

    if (pendingRequest.status === "accepted") {
      return res.status(400).json({ error: "Club request already accepted" });
    }

    let group = await ChatRoom.findOne({ roomId: postData._id });
    if (!group) {
      group = new ChatRoom({
        roomId: postData._id,
        groupName: postData.title,
        members: [recipientId, requesterId],
      });
    } else {
      group.members.push(requesterId);
    }

    pendingRequest.status = "accepted";
    pendingRequest.updatedAt = Date.now();
    await pendingRequest.save();

    await group.save();

    return res
      .status(200)
      .json({ message: "Club request accepted and added to Club chat" });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.declineClubRequest = async (req, res) => {
  try {
    const { requesterId, postId } = req.body;

    const recipientId = req.User._id;
    //postId = "669df8d76aa6d05e12291940";
    //requesterId = "669defbe9dba6cc174c04f0a";
    const postData = await post.findById(postId);
    if (!postData) {
      return res.status(404).json({ error: "Post Not Found" });
    }

    if (postData.userId.equals(requesterId)) {
      return res.status(404).json({
        error:
          "You can not use your userId as requesterId to declined ClubRequest",
      });
    }

    const requester = await User.findById(requesterId);
    if (!requester) {
      return res.status(404).json({ error: "requester Not Found" });
    }

    const pendingRequest = await ClubRequest.findOne({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    if (pendingRequest) {
      if (pendingRequest.status === "declined")
        return res.status(400).json({ error: "Club request already declined" });
    } else {
      return res.status(400).json({ error: "Pending Request Not Found" });
    }

    pendingRequest.status = "declined";
    pendingRequest.updatedAt = Date.now();
    await pendingRequest.save();
    return res.status(200).json({ message: "club request declined" });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.removeUserFromClub = async (req, res) => {
  try {
    const { roomId, userId } = req.body;

    const room = await ChatRoom.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Chat room not found" });
    }

    if (!room.members.includes(userId)) {
      return res.status(400).json({ error: "User not in chat room" });
    }

    // room.members.pull(userId);
    // await room.save();

    req.app.get("io").to(roomId).emit("userRemoved", { roomId, userId });

    return res.status(200).json({ message: "User removed from chat room" });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};
