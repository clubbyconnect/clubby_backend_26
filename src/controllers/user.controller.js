const otpGenerator = require("otp-generator");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const Facebook = require("facebook-node-sdk");
const { appleAuth } = require("apple-auth");
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
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
const { sendPushNotification } = require('../controllers/data.controller.js');

//Group chat
const Group = require('../models/group.js');
const Message = require('../models/message.js');
const Voting = require('../models/voting.js')
const { getIO } = require("../sockets/chats.js");



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
  } catch (error) { }
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
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );

    return res
      .status(200)
      .json({
        message: "User registered successfully", data: { accessToken: accessToken, userInfo: user },
      });
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
        data: { accessToken: accessToken, userInfo: loggedInUser },
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
        data: accessToken
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
      .json({ message: "User signed in successfully", data: { accessToken: accessToken, userInfo: loggedInUser } });
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

const images = {
  "Fashion": {
    "Men": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/qmfhhaqrr3xpewext2kj.jpg",
    "Women": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/qmfhhaqrr3xpewext2kj.jpg",
    "Kids": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/qmfhhaqrr3xpewext2kj.jpg",
    "Accessories": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/qmfhhaqrr3xpewext2kj.jpg",
    "Footwear": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/qmfhhaqrr3xpewext2kj.jpg",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/qmfhhaqrr3xpewext2kj.jpg",
  },
  "Grocery": {
    "Fresh Produce": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/na3jgujro7ekhc3kxcnn.jpg",
    "Dairy Products": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/na3jgujro7ekhc3kxcnn.jpg",
    "Packaged Foods": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/na3jgujro7ekhc3kxcnn.jpg",
    "Frozen Foods": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/na3jgujro7ekhc3kxcnn.jpg",
    "Beverages": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/na3jgujro7ekhc3kxcnn.jpg",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/na3jgujro7ekhc3kxcnn.jpg",
  },
  "Body Care": {
    "Skincare": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ob6wbqokv4bsv2nqcg5t.png",
    "Haircare": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ob6wbqokv4bsv2nqcg5t.png",
    "Oral Care": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ob6wbqokv4bsv2nqcg5t.png",
    "Body Hygiene": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ob6wbqokv4bsv2nqcg5t.png",
    "Fragrance": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ob6wbqokv4bsv2nqcg5t.png",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ob6wbqokv4bsv2nqcg5t.png",
  },
  "Fit & Sport": {
    "Fitness Apparel": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/pd9xd6qdqfijbpgla7s6.jpg",
    "Exercise Equipment": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/pd9xd6qdqfijbpgla7s6.jpg",
    "Sports Gear": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/pd9xd6qdqfijbpgla7s6.jpg",
    "Outdoor Equipment": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/pd9xd6qdqfijbpgla7s6.jpg",
    "Nutrition": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/pd9xd6qdqfijbpgla7s6.jpg",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/pd9xd6qdqfijbpgla7s6.jpg",
  },
  "Kitchenware": {
    "Cookware": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/pvmhybhxdi9lkd290rtc.jpg",
    "Utensils": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/pvmhybhxdi9lkd290rtc.jpg",
    "Storage Solutions": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/pvmhybhxdi9lkd290rtc.jpg",
    "Small Appliances": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/pvmhybhxdi9lkd290rtc.jpg",
    "Tableware": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/pvmhybhxdi9lkd290rtc.jpg",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/pvmhybhxdi9lkd290rtc.jpg",
  },
  "Bags & Travel": {
    "Luggage": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ipvggoowhouuqu2mejkq.jpg",
    "Travel Accessories": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ipvggoowhouuqu2mejkq.jpg",
    "Outdoor Bags": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ipvggoowhouuqu2mejkq.jpg",
    "Tech Accessories": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ipvggoowhouuqu2mejkq.jpg",
    "Safety Items": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ipvggoowhouuqu2mejkq.jpg",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/ipvggoowhouuqu2mejkq.jpg",
  },
  "Gadgets": {
    "Smartphones & Accessories": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/vo25i61selyntyxceet1.jpg",
    "Home Appliances": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/vo25i61selyntyxceet1.jpg",
    "Wearable Tech": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/vo25i61selyntyxceet1.jpg",
    "Gaming Gear": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/vo25i61selyntyxceet1.jpg",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/vo25i61selyntyxceet1.jpg",
  },
  "DIY Supplies": {
    "Tools": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/nzems4sn0jnsog1fiiuh.png",
    "Materials": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/nzems4sn0jnsog1fiiuh.png",
    "Crafting Supplies": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/nzems4sn0jnsog1fiiuh.png",
    "Gardening Supplies": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/nzems4sn0jnsog1fiiuh.png",
    "Home Improvement": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/nzems4sn0jnsog1fiiuh.png",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500943/default%20images/categories/nzems4sn0jnsog1fiiuh.png",
  },
  "Pet Accessories": {
    "Food & Treats": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/ekkqtpitirw8fxaputay.png",
    "Bedding & Housing": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/ekkqtpitirw8fxaputay.png",
    "Toys": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/ekkqtpitirw8fxaputay.png",
    "Grooming Supplies": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/ekkqtpitirw8fxaputay.png",
    "Health & Care": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/ekkqtpitirw8fxaputay.png",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/ekkqtpitirw8fxaputay.png",
  },
  "Learning Resources": {
    "Books": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/fgkeqvpaecvkke4ecgqb.jpg",
    "Classes Courses": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/fgkeqvpaecvkke4ecgqb.jpg",
    "Stationery": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/fgkeqvpaecvkke4ecgqb.jpg",
    "Educational Tools": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/fgkeqvpaecvkke4ecgqb.jpg",
    "Children's Learning Materials": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/fgkeqvpaecvkke4ecgqb.jpg",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/fgkeqvpaecvkke4ecgqb.jpg",
  },
  "Wooden Goods": {
    "Living Room": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/mgbfz7ebxcys4tomvet4.png",
    "Bedroom": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/mgbfz7ebxcys4tomvet4.png",
    "Storage": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/mgbfz7ebxcys4tomvet4.png",
    "Dining": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/mgbfz7ebxcys4tomvet4.png",
    "Shelves": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/mgbfz7ebxcys4tomvet4.png",
    "Others": "https://res.cloudinary.com/dlb8pmzph/image/upload/v1729500942/default%20images/categories/mgbfz7ebxcys4tomvet4.png",
  },
};


exports.createPost = async (req, res) => {
  try {
    const {
      // clubType,
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
    } = req.body;
    console.log(req.headers, req.body)
    if (
      [
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

    const productImageLocalPath = req.file?.path;
    let productImage;

    if (productImageLocalPath) {
      productImage = await uploadOnCloudinary(productImageLocalPath);
    } else {

      if (!images[category] || !images[category][subCategory]) {
        return res.status(400).json({ error: "Invalid category or subcategory." });
      }
      productImage = { url: images[category][subCategory] }; 
    }

    const CategoryClubType = CategoryModel;

    const categoryObj = await CategoryClubType.findOne({ name: category });
    if (!categoryObj)
      return res.status(400).json({ error: "Invalid category." });

    const subcategoryObj = await CategoryClubType.findOne({ name: subCategory });
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
    };

    if (size) postData.size = size;
    if (additionalInformation)
      postData.additionalInformation = additionalInformation;

    postData.store_location = {
      type: "Point",
      coordinates: [
        parseFloat(store_location_longitude),
        parseFloat(store_location_latitude),
      ],
    };
    const createdPost = await post.create(postData);

    if (!createdPost._id)
      return res.status(500).json({ error: "Unable to create post." });

    const memberLimit = parseInt(clubMembers, 10);
    if (isNaN(memberLimit) || memberLimit <= 0) {
      return res.status(400).json({ error: "Invalid value for clubMembers." });
    } 

    const groupData = {
      productId: createdPost._id,
      productName: itemName,
      adminId: req.User._id, 
      members: [req.User._id], 
      limit: memberLimit,
      isActive: true,
    };

    const createdGroup = await Group.create(groupData);
    if (!createdGroup._id)
      return res.status(500).json({ error: "Unable to create group." });

    createdPost.groupId = createdGroup._id;
    await createdPost.save();

    const populatedPost = await post
      .findById(createdPost._id)
      .populate("category", "name")
      .populate("subCategory", "name");

    console.log(populatedPost,"LLLLLLLLLLLL")
    return res.status(200).json({
      message: "Post created successfully.",
      post: {
        ...populatedPost._doc,
        category: populatedPost.category.name,
        subCategory: populatedPost.subCategory.name,
        group: createdGroup._id
      },
    });
  } catch (error) {
    console.log(error)
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
      address,
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
    if (address) {
      updateDetails.address.address_text = address.address_text;
      updateDetails.address.latitude = address.latitude;
      updateDetails.address.longitude = address.longitude;
    }
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

exports.UpdateUserLikePost = async (req, res) => {
  try {
    const {
      likePostId,
    } = req.body;
    const userId = req.User._id;
    let updateDetails = await User.findById(userId);
    if (likePostId) {
      if (updateDetails.postLikeId.includes(likePostId)) {
        let tempData = updateDetails.postLikeId.filter((item) => {
          return item.toString() !== likePostId
        })
        updateDetails.postLikeId = tempData
        updateDetails = await updateDetails.save();
        return res.status(200).json({ message: "Post like removed successfully" });
      } else {
        updateDetails.postLikeId.push(likePostId)
        updateDetails = await updateDetails.save();
        return res.status(200).json({ message: "Post like successfully" });
      }
    }
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.getUserLikePost = async (req, res) => {

  try {
    const excludeField = "-store_location  -_id   -password -refreshToken -UserRating -store_location_latitude -store_location_longitude -createdAt -updatedAt -__v -reportedBy -reportMessage";
    const userId = req.User._id;
    let updateDetails = await User.findById(userId);
    const allPost = await post.find({ _id: { $in: updateDetails.postLikeId } }).select(`${excludeField}`).populate('category', 'name').populate('subCategory', 'name');
    return res
      .status(200)
      .json({ message: "Post data fetch successfully", data: allPost });

  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.getPost = async (req, res) => {
  try {
    const userId = req.User._id
    const products = await post.find({ userId }).populate('category', 'name').populate('subCategory', 'name');

    res.status(200).json({ post: products });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch products', error });
  }
}
//------------------------------------------User Request---------------------------------------------
exports.sendClubRequest = async (req, res) => {
  try {
    console.log("hittttt")
    const { postId } = req.body
    const requesterId = req.User._id;
    console.log(requesterId,"LLLLLLL")
    const postData = await post.findById(postId);
    if (!postData) {
      return res.status(404).json({ error: "Post Not Found" });
    }

    if (postData.userId.toString() === requesterId.toString()) {
      return res.status(400).json({ error: "You cannot send a ClubRequest to your own Post" });
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
    const recipient = await User.findById(recipientId);
    if (recipient && recipient.fcmToken) {
      const notificationData = {
        token: recipient.fcmToken,
        notification: {
          title: "New Club Request",
          body: `You have received a club request for your post "${postData.title}".`,
        },
        data: {
          postId: postId.toString(),
          requesterId: requesterId.toString(),
        },
      };
      sendPushNotification(notificationData)
        .then((response) => {
          console.log("Notification sent successfully:", response);
        })
        .catch((error) => {
          console.error("Error sending notification:", error);
        });
    } else {
      console.warn("Recipient does not have an FCM token.");
    }
    return res.status(200).json({ message: "Club request sent" });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Error sending Club request", error });
  }
};

exports.getRequestList = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }
    const userId = req.User._id;
    const postData = await post.findById(productId);

    if (!postData) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (!postData.userId.equals(userId)) {
      return res.status(403).json({ error: "You are not authorized to view requests for this post" });
    } 

    const clubRequests = await ClubRequest.find({ postId: productId })
      .populate("requester", "firstName lastName email avatar gender")
    if (!clubRequests.length) {
      return res.status(404).json({ error: "No requests found for this post" });
    }

    return res.status(200).json({
      message: "Request list retrieved successfully",
      requests: clubRequests.map((request) => ({
        _id: request._id,
        requester: request.requester,
        createdAt: request.createdAt, 
        status:request.status

      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Error retrieving request list",
      details: error.message,
    });
  }
};

exports.acceptClubRequest = async (req, res) => {
  try {
    const { requesterId, postId } = req.body;
    const recipientId = req.User._id;
    if (!requesterId || !postId) {
      return res.status(400).json({ error: "requesterId and postId are required." });
    }
    const postData = await post.findById(postId);
    if (!postData) {
      return res.status(404).json({ error: "Post Not Found" });
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
      return res.status(400).json({ error: "Club request already accepted." });
    } 
    pendingRequest.status = "accepted";
    pendingRequest.updatedAt = Date.now();
    await pendingRequest.save();
    const group = await Group.findOne({ productId: postId });
    
    if (!group) {
      return res.status(404).json({ error: "Group not found for this post." });
    }
    if (group.members.includes(requesterId)) {
      return res.status(400).json({ error: "Requester is already a member of the group." });
    }
    group.members.push(requesterId);
    await group.save();
    const requesterFirstName = requester.firstName || "User";
    await exports.sendSystemMessage(group._id, `${requesterFirstName} has been added to the group.`);

    return res.status(200).json({
      message: "Club request accepted and user added to the group.",
      group,
    });
  } catch (error) {
    console.error("Error in acceptClubRequest:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.fetchGroupMembers = async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId) {
      return res.status(400).json({ message: "PostId is required." });
    }
    const group = await Group.findOne({ productId: postId }).populate("members", "firstName lastName email avatar" ); // Populate member details (e.g., name, email)
    if (!group) {
      return res.status(404).json({ message: "Group not found for this post." });
    }
    const membersExcludingOwner = group.members.filter(
      (member) => !member._id.equals(group.adminId)
    );
    return res.status(200).json({
      message: "Group members fetched successfully.",
      members: membersExcludingOwner,
    });
  } catch (error) {
    console.error("Error in fetchGroupMembers:", error);
    return res.status(500).json({ message: "Internal server error." });
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
      return res.status(404).json({ error: "You can not use your userId as requesterId to declined ClubRequest", });
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
      return res.status(404).json({ error: 'Chat room not found' });
    }

    if (!room.members.includes(userId)) {
      return res.status(400).json({ error: 'User not in chat room' });
    }

    // room.members.pull(userId);
    // await room.save();

    req.app.get('io').to(roomId).emit('userRemoved', { roomId, userId });

    return res.status(200).json({ message: 'User removed from chat room' });

  } catch (error) {
    serverErrorHandler(error, res);
  }
};

// Helper function to send system message
exports.sendSystemMessage = async (groupId, content) => {
  const newMessage = await Message.create({
    groupId,
    content,
    type: "system", // Assuming there's a 'system' type in your Message model
    timestamp: new Date(),
  });

  console.log('In the system message ', groupId.toString())
  const io = getIO(); // Emit the updated admin to the group members
  // Emit groupId and content along with the new message
  io.to(groupId.toString()).emit("newMessage", newMessage);

  console.log(`Emitting new message to.. group ${groupId}:`, newMessage);

};

// Group chat module starts

// Create or join a group avoid duplicate user to join
exports.createOrJoinGroup = async (req, res) => {
  const { productId, productName, limit, adminId, userId } = req.body;

  try {
    // Accepting club request
    const { requesterId, postId } = req.body;
    const recipientId = req.User._id;

    if (requesterId) {
      const postData = await post.findById(postId);
      if (!postData) {
        return res.status(404).json({ error: "Post Not Found" });
      }

      if (postData.userId.equals(requesterId)) {
        return res.status(400).json({
          message: "You cannot use your userId as requesterId to Accept ClubRequest",
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

      pendingRequest.status = "accepted";
      pendingRequest.updatedAt = Date.now();
      await pendingRequest.save();

      // **Push Notification for Club Request Acceptance**
      if (requester.fcmToken) {
        const notificationData = {
          token: requester.fcmToken, // Send notification to the requester
          notification: {
            title: "Club Request Accepted",
            body: `Your club request for post "${postData.title}" has been accepted.`,
          },
          data: {
            postId: postId.toString(),
            recipientId: recipientId.toString(),
          },
        };

        // Send the push notification
        await sendPushNotification(notificationData);
      }
    }

    // Find the group by productId
    let group = await Group.findOne({ productId });

    // If the group does not exist, create a new group
    if (!group) {
      group = await Group.create({
        productId,
        productName,
        limit,
        adminId: adminId || userId,
        members: [adminId || userId],
      });

      // Emit group creation event
      const io = getIO();
      io.emit("groupCreated", { groupId: group._id, productName, adminId: group.adminId });

      // **Push Notification for Group Creation**
      const admin = await User.findById(adminId || userId); // Find the admin who created the group
      if (admin && admin.fcmToken) {
        const notificationData = {
          token: admin.fcmToken, // Send notification to the admin
          notification: {
            title: "Group Created",
            body: `A new group for product "${productName}" has been created.`,
          },
          data: {
            productId: productId.toString(),
          },
        };

        // Send the push notification
        await sendPushNotification(notificationData);
      }

      return res.status(201).json({ message: "Group created", group });
    }

    // If the group has reached the member limit
    if (group.members.length >= group.limit) {
      if (group.adminId.equals(userId)) {
        return res.status(403).json({
          message: "Group is full. Would you like to deactivate the group?",
          action: "deactivateOption",
        });
      } else {
        return res.status(403).json({ message: "Group is full." });
      }
    }

    // Check if the user is already a member of the group
    const isUserInGroup = group.members.some(member => member.equals(userId));
    if (isUserInGroup) {
      return res.status(400).json({ message: "User already exists in the group." });
    }

    // Add the user to the group
    group.members.push(userId);
    await group.save();

    try {
      await exports.sendSystemMessage(group._id, `${userId} has joined the group.`);
    } catch (error) {
      console.error("Error in sendSystemMessage:", error); // Log the error for more details
    }

    // Emit member joining event
    const io = getIO();
    io.to(group._id).emit("memberJoined", { userId });

    // **Push Notification for User Joining**
    const user = await User.findById(userId); // Find the user who joined the group
    if (user && user.fcmToken) {
      const notificationData = {
        token: user.fcmToken, // Send notification to the user who joined
        notification: {
          title: "New Member Joined",
          body: `You have successfully joined the group for product "${productName}".`,
        },
        data: {
          productId: productId.toString(),
        },
      };

      // Send the push notification
      await sendPushNotification(notificationData);
    }

    return res.status(200).json({ message: "Joined the group", group });
  } catch (error) {
    console.error("Error in create/join group:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};


// Deactivate a group (admin only)
exports.deactivateGroup = async (req, res) => {
  const { groupId, adminId } = req.body;
  try {
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }
    // Check if the user making the request is the admin
    if (!group.adminId.equals(adminId)) {
      return res.status(403).json({ message: "Only the admin can deactivate the group." });
    }
    // Mark the group as inactive
    group.isActive = false;
    await group.save();
    // Emit the group deactivation event to notify all members
    const io = getIO();
    io.to(group._id).emit("groupDeactivated", { groupId });
    return res.status(200).json({ message: "Group has been deactivated", group });
  } catch (error) {
    console.error("Error deactivating group:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
// Send a message in the group
exports.sendMessage = async (req, res) => {
  console.log('Request body:', req.body);
  console.log('req.file ', req.file)

  // Access image, audio, and video files from req.files
  const imageFile = req.files?.image ? req.files.image[0] : null;
  const audioFile = req.files?.audio ? req.files.audio[0] : null;
  const videoFile = req.files?.video ? req.files.video[0] : null;

  console.log('Audio file:', audioFile);
  console.log('Image file:', imageFile);
  console.log('Video file:', videoFile);

  const { groupId, messageType, messageContent } = req.body;
  console.log('req.User is ', req.User)
  const userId = req.User._id;

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }
    console.log('group is ', group.isActive)


    // Check if the user is a member of the group
    const isMember = group.members.includes(userId);
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    // Check if the group is active
    if (!group.isActive) {
      return res.status(403).json({ message: "No one can send messages as the group is deactivated." });
    }

    let finalMessageContent = messageContent;

    if (messageType === 'image') {
      const imageLocalPath = imageFile.path;
      if (!imageLocalPath) {
        return res.status(400).json({ error: "Image file is required for image messages" });
      }

      const cloudinaryResult = await uploadOnCloudinary(imageLocalPath);
      if (!cloudinaryResult || !cloudinaryResult.secure_url) {
        return res.status(500).json({ error: "Failed to upload image to Cloudinary" });
      }

      finalMessageContent = cloudinaryResult.secure_url;
    }

    if (messageType === 'audio') {
      const audioLocalPath = audioFile.path;
      if (!audioLocalPath) {
        return res.status(400).json({ error: "Audio file is required for audio messages" });
      }
      console.log('audio part...')

      const cloudinaryResult = await uploadOnCloudinary(audioLocalPath);
      if (!cloudinaryResult || !cloudinaryResult.secure_url) {
        return res.status(500).json({ error: "Failed to upload Audio to Cloudinary" });
      }
      console.log('audio part URL ', cloudinaryResult.secure_url)

      finalMessageContent = cloudinaryResult.secure_url;
    }
    if (messageType === 'video') {
      const videoLocalPath = videoFile.path;
      if (!videoLocalPath) {
        return res.status(400).json({ error: "Image file is required for image messages" });
      }

      const cloudinaryResult = await uploadOnCloudinary(videoLocalPath);
      if (!cloudinaryResult || !cloudinaryResult.secure_url) {
        return res.status(500).json({ error: "Failed to upload image to Cloudinary" });
      }

      finalMessageContent = cloudinaryResult.secure_url;
    }

    const newMessage = await Message.create({
      groupId,
      senderId: userId,
      content: finalMessageContent,
      type: messageType,
    });

    group.messages.push(newMessage._id);
    await group.save();

    // Emit message to the socket (real-time update)
    // const io = getIO();
    // io.to(groupId).emit("newMessage", newMessage);

    return res.status(201).json(newMessage);

  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
// New function to mark a message as read
exports.markMessageAsRead = async (req, res) => {
  const { messageId } = req.body;
  const userId = req.User._id;
  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }
    // Check if the user has already read the message
    if (!message.readBy.some(read => read.userId.equals(userId))) {
      message.readBy.push({ userId, readAt: new Date() });
      await message.save();

      // Emit the read receipt to all users in the group
      const io = getIO();
      io.to(message.groupId.toString()).emit("messageRead", { messageId, userId });
    }

    return res.status(200).json({ message: "Message marked as read." });
  } catch (error) {
    console.error("Error marking message as read:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.leaveGroup = async (req, res) => {
  const { groupId, userId, newAdminId } = req.body;
  console.log(groupId,userId,newAdminId,"LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL")
  if (!groupId || !userId) {
    return res.status(400).json({ message: 'groupId and userId are required.' });
  }
  try {
    const group = await Group.findById(groupId);
    console.log('groupId, userId, newAdminId  group.adminId', groupId, userId, newAdminId, group?.adminId)

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }
    const isMember = group.members.includes(userId);
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const userFirstName = user.firstName || "User";
    const userObjectId = new mongoose.Types.ObjectId(userId);
    console.log(userObjectId,"LLLLLLLLLLLLLLLLLLLLLLLLLLLsssssssssss")
    const newAdminObjectId = new mongoose.Types.ObjectId(newAdminId);
    if (group.adminId.equals(userObjectId)) {
      if (!group.isActive) {
        return res.status(403).json({ message: "No action can perform as Group is deactivated." });
      }
      if (newAdminId) {
        const newAdmin = await User.findById(newAdminId);
        if (!newAdmin) {
          return res.status(404).json({ message: "new Admin not found." });
        }
        const newAdminFirstName = newAdmin.firstName || "User";
        console.log('Making Admin working')
        group.adminId = newAdminObjectId;
        ;
        group.members = group.members.filter(member => !member.equals(userObjectId));
        const postToUpdate = await post.findOne({ groupId });
        if (postToUpdate) {
          postToUpdate.userId = newAdminObjectId;
          await postToUpdate.save();
          console.log("admin updated")
        }
        await group.save();
        await exports.sendSystemMessage(group._id, `${userFirstName} transferred admin rights to ${newAdminFirstName}.`);
        await exports.sendSystemMessage(group._id, `${userFirstName} left the group.`);
        // const io = getIO(); // Emit the updated admin to the group members
        // io.to(group._id).emit("sendSystemMessage", { newAdminId });
        return res.status(200).json({ message: "Admin rights transferred", group });
      } else {
        // Deactivate group if no new admin is specified
        // await Group.deleteOne({ _id: groupId });
        group.isActive = false;
        await group.save();
        await exports.sendSystemMessage(group._id, `${userFirstName} deactivate the group. No one can send message now.`);
        // const io = getIO(); // Emit group deactivation
        // io.to(group._id).emit("groupDeactivated", { groupId });
        return res.status(200).json({ message: "Group deactivated" });
      }
    } else {
      console.log("hsitttttttttt")
      // Normal user leaving the group without voting
      group.members = group.members.filter(member => !member.equals(userObjectId));
      await group.save();
      await exports.sendSystemMessage(group._id, `${userFirstName} has left the group.`);
      // const io = getIO(); // Emit user leave event to the group members
      // io.to(group._id).emit("memberLeft", { userId });
      return res.status(200).json({ message: "User has left the group", group });
    }
  } catch (error) {
    console.error("Error in leave group:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.isConnected = async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId) {
      return res.status(400).json({ message: "PostId is required." });
    }
    const group = await Group.findOne({ productId: postId });

    if (!group) {
      return res.status(404).json({ message: "Group not found for this post." });
    }
    const otherMembers = group.members.filter(
      (memberId) => !memberId.equals(group.adminId)
    );
    if (otherMembers.length > 0) {
      return res.status(200).json({ isConnected: true });
    } else {
      return res.status(200).json({ isConnected: false });
    }
  } catch (error) {
    console.error("Error in isConnected:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.deletePost = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { postId } = req.body;
    if (!postId) {
      return res.status(400).json({ message: "PostId is required." });
    }
    const existingPost = await post.findById(postId).session(session);
    if (!existingPost) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Post not found." });
    }
    const associatedGroup = await Group.findOne({ postId }).session(session);
    await post.findByIdAndDelete(postId).session(session);
    if (associatedGroup) {
      await Group.findByIdAndDelete(associatedGroup._id).session(session);
    }
    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({
      message: "Post and associated group deleted successfully.",
      postId,
      groupId: associatedGroup ? associatedGroup._id : null,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in deletePost:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.getGroupsForUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const groups = await Group.find({ members: new mongoose.Types.ObjectId(userId) });
    return res.status(200).json(groups);
  } catch (error) {
    console.error("Error fetching groups for user:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// Get messages for a specific group
exports.getMessagesForGroup = async (req, res) => {
  const { groupId } = req.params;

  try {
    // Retrieve all messages for the given groupId
    const messages = await Message.find({ groupId })
      .populate('senderId', 'firstName avatar') // Populate senderId to get username
      .sort({ createdAt: 1 }) // Sort messages by creation date in ascending order (oldest first)

    // Return messages in the response
    return res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// Controller function to fetch group members and admin by productId
exports.getGroupMembersAndAdmin = async (req, res) => {
  const { groupId } = req.params;  // Get groupId from URL params
  console.log('groupId ', groupId);

  try {
    // Find the group by _id (groupId) and populate adminId and members fields
    const group = await Group.findById((groupId)) // Find by _id
      .populate('adminId', 'firstName') // Populate adminId with admin's name and email
      .populate('members', 'firstName'); // Populate members with their names and emails

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    return res.status(200).json({
      message: "Group details fetched successfully",
      admin: group.adminId,   // Return admin details
      members: group.members, // Return member details
    });
  } catch (error) {
    console.error("Error fetching group members and admin:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

//Currently no need of these
// Helper function for sending a voting message
exports.sendVotingMessage = async (groupId, userId) => {
  const messageContent = `${userId} wants to leave the group. Please vote (yes/no).`;
  await exports.sendSystemMessage(groupId, messageContent);
};

// Cast vote process
exports.castVote = async (req, res) => {
  const { votingId, voterId, vote } = req.body;
  try {
    const voting = await Voting.findById(votingId);

    if (!voting || voting.status !== "ongoing") {
      return res.status(404).json({ message: "No ongoing voting found." });
    }

    if (voting.votes[voterId]) {
      return res.status(400).json({ message: "You have already voted." });
    }

    voting.votes[voterId] = vote;
    await voting.save();

    const io = getIO();
    io.to(voting.groupId).emit("voteUpdate", { voterId, vote });

    const group = await Group.findById(voting.groupId);
    const allMembersVoted = group.members.every((member) => voting.votes[member]);

    if (allMembersVoted) {
      const allVotesAreYes = Object.values(voting.votes).every((vote) => vote === "yes");

      if (allVotesAreYes) {
        group.members = group.members.filter((member) => member !== voting.userId);
        await group.save();
        voting.status = "completed";
        await voting.save();
        await exports.sendSystemMessage(group._id, `${voting.userId} has left the group after a successful vote.`);
        io.to(voting.groupId).emit("voteCompleted", { status: "success", userId: voting.userId });
        return res.status(200).json({ message: "User has successfully left the group.", group });
      } else {
        voting.status = "denied";
        await voting.save();
        await exports.sendSystemMessage(group._id, `${voting.userId}'s request to leave was denied.`);
        io.to(voting.groupId).emit("voteCompleted", { status: "denied", userId: voting.userId });
        return res.status(200).json({ message: "Leave request denied.", group });
      }
    }

    return res.status(200).json({ message: "Vote registered.", voting });
  } catch (error) {
    console.error("Error casting vote:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};





exports.addToFavourites = async (req, res) => {
  try {
    const userId = req.User._id;
    const { productId } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({ message: "User ID and Product ID are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if product is already in favourites
    const productIndex = user.favourites.indexOf(productId);

    if (productIndex !== -1) {
      // Remove product from favourites
      user.favourites.splice(productIndex, 1);
      await user.save();
      return res.status(200).json({ message: "Product removed from favourites", favourites: user.favourites });
    }

    // Add product to favourites
    user.favourites.push(productId);
    await user.save();

    res.status(200).json({ message: "Product added to favourites", favourites: user.favourites });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getFavoriteProducts = async (req, res) => {
  try {
    const userId = req.User._id;
    const { lat, lon } = req.query;

    // Validate latitude and longitude
    if (!lat || !lon) {
      return res.status(400).json({ success: false, message: "Latitude and longitude are required" });
    }

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      return res.status(400).json({ success: false, message: "Invalid latitude or longitude" });
    }

    // Fetch user to get their favorite products
    const user = await User.findById(userId).select("favourites").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log("User's Favourites:", user.favourites); // Log user's favourite product IDs

    if (!user.favourites || user.favourites.length === 0) {
      return res.status(404).json({ success: false, message: "No favorite products found" });
    }

    let aggregatePipeline = [];

    // GeoNear for distance calculation
    aggregatePipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [parsedLon, parsedLat],
        },
        distanceField: "distance",
        spherical: true,
        key: "store_location.coordinates",
      },
    });

    // Match user's favorite products
    aggregatePipeline.push({
      $match: {
        _id: { $in: user.favourites.map(id => new mongoose.Types.ObjectId(id)) }, // Ensure correct ID type
      },
    });

    // Lookup for category details
    aggregatePipeline.push(
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      {
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      // Direct lookup for subcategory as a category document
      {
        $lookup: {
          from: "categories",
          localField: "subCategory",  // This is the subcategory ID in your product
          foreignField: "_id",        // This will match directly with category documents
          as: "subCategoryDetails"
        }
      },
      {
        $unwind: {
          path: "$subCategoryDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      // Lookup for group info
      {
        $lookup: {
          from: "groups",
          let: { productId: { $toString: "$_id" } },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$productId"] } } },
          ],
          as: "groupInfo",
        },
      },
      {
        $unwind: {
          path: "$groupInfo",
          preserveNullAndEmptyArrays: true,
        },
      }
    );

    // Project required fields
    aggregatePipeline.push({
      $project: {
        _id: 1,
        userId: 1,
        itemName: 1,
        // offerType: 1,
        // price: 1,
        // price_type: 1,
        clubMembers: 1,
        clubToJoin: {
          $cond: {
            if: { $isArray: "$groupInfo.members" },
            then: { $subtract: ["$clubMembers", { $size: "$groupInfo.members" }] },
            else: { $subtract: ["$clubMembers", 1] },
          },
        },
        // additionalInformation: 1,
        size: 1,
        // itemLink: 1,
        // platform: 1,
        // paymentMode: 1,
        productImage: 1,
        clubStatus: 1,
        // reportCount: 1,
        // reportedBy: 1,
        // reportMessage: 1,
        // createdAt: 1,
        // updatedAt: 1,
        // store_location: 1,
        // delivery_location: 1,
        categoryName: "$categoryDetails.name",
        // categoryImage: "$categoryDetails.image",
        // subCategoryName: "$subCategoryDetails.name",
        // subCategoryImage: "$subCategoryDetails.image",
        distance: {
          $cond: {
            if: { $lt: ["$distance", 1] },
            then: 0,
            else: { $divide: ["$distance", 1000] },
          },
        },
      },
    });

    console.log("Aggregation Pipeline:", JSON.stringify(aggregatePipeline, null, 2)); // Log the aggregation pipeline

    const favoriteProducts = await post.aggregate(aggregatePipeline);

    console.log("Favorite Products:", favoriteProducts); // Log the result of the aggregation query

    if (favoriteProducts.length === 0) {
      return res.status(404).json({ success: false, message: "No favorite products found 2" });
    }

    res.status(200).json({ success: true, data: favoriteProducts });
  } catch (error) {
    console.error("Error fetching favorite products:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

exports.getFilteredFavoriteProducts = async (req, res) => {
  try {

    const userId = req.User._id;
    const { lat, lon, status } = req.query;

    // Validate latitude and longitude
    if (!lat || !lon) {
      return res.status(400).json({ success: false, message: "Latitude and longitude are required" });
    }

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      return res.status(400).json({ success: false, message: "Invalid latitude or longitude" });
    }

    // Validate status filter (if provided)
    const validStatuses = ["Active", "Inactive", "Full", "Pending", "Created"];
    let statusFilter = {};
    if (status && validStatuses.includes(status)) {
      statusFilter = { clubStatus: status };
    }

    // Fetch user to get their favorite products
    const user = await User.findById(userId).select("favourites").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log("User's Favourites:", user.favourites); // Log user's favourite product IDs

    if (!user.favourites || user.favourites.length === 0) {
      return res.status(404).json({ success: false, message: "No favorite products found" });
    }

    let aggregatePipeline = [];

    // GeoNear for distance calculation
    aggregatePipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [parsedLon, parsedLat],
        },
        distanceField: "distance",
        spherical: true,
        key: "store_location.coordinates",
      },
    });

    // Match user's favorite products and apply status filter if provided
    aggregatePipeline.push({
      $match: {
        _id: { $in: user.favourites.map(id => new mongoose.Types.ObjectId(id)) }, // Ensure correct ID type
        ...statusFilter, // Apply the status filter if provided
      },
    });

    // Lookup for category details
    aggregatePipeline.push(
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      {
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      // Direct lookup for subcategory as a category document
      {
        $lookup: {
          from: "categories",
          localField: "subCategory",  // This is the subcategory ID in your product
          foreignField: "_id",        // This will match directly with category documents
          as: "subCategoryDetails"
        }
      },
      {
        $unwind: {
          path: "$subCategoryDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      // Lookup for group info
      {
        $lookup: {
          from: "groups",
          let: { productId: { $toString: "$_id" } },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$productId"] } } },
          ],
          as: "groupInfo",
        },
      },
      {
        $unwind: {
          path: "$groupInfo",
          preserveNullAndEmptyArrays: true,
        },
      }
    );

    // Project required fields
    aggregatePipeline.push({
      $project: {
        _id: 1,
        userId: 1,
        itemName: 1,
        // offerType: 1,
        // price: 1,
        // price_type: 1,
        clubMembers: 1,
        clubToJoin: {
          $cond: {
            if: { $isArray: "$groupInfo.members" },
            then: { $subtract: ["$clubMembers", { $size: "$groupInfo.members" }] },
            else: { $subtract: ["$clubMembers", 1] },
          },
        },
        // additionalInformation: 1,
        size: 1,
        // itemLink: 1,
        // platform: 1,
        // paymentMode: 1,
        productImage: 1,
        clubStatus: 1,
        // reportCount: 1,
        // reportedBy: 1,
        // reportMessage: 1,
        // createdAt: 1,
        // updatedAt: 1,
        // store_location: 1,
        // delivery_location: 1,
        categoryName: "$categoryDetails.name",
        // categoryImage: "$categoryDetails.image",
        // subCategoryName: "$subCategoryDetails.name",
        // subCategoryImage: "$subCategoryDetails.image",
        distance: {
          $cond: {
            if: { $lt: ["$distance", 1] },
            then: 0,
            else: { $divide: ["$distance", 1000] },
          },
        },
      },
    });

    console.log("Aggregation Pipeline:", JSON.stringify(aggregatePipeline, null, 2)); // Log the aggregation pipeline

    const filteredFavoriteProducts = await post.aggregate(aggregatePipeline);

    console.log("Filtered Favorite Products:", filteredFavoriteProducts); // Log the result of the aggregation query

    if (filteredFavoriteProducts.length === 0) {
      return res.status(404).json({ success: false, message: "No favorite products found" });
    }

    res.status(200).json({ success: true, data: filteredFavoriteProducts });
  } catch (error) {
    console.error("Error fetching filtered favorite products:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

exports.getUserPosts = async (req, res) => {
  try {
    const userId = req.User._id;
    const { lon, lat, status } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ success: false, message: "Latitude and longitude are required" });
    }

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      return res.status(400).json({ success: false, message: "Invalid latitude or longitude" });
    }

    const userIdObjectId = new mongoose.Types.ObjectId(userId);

    let aggregatePipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [parsedLon, parsedLat],
          },
          distanceField: "distance",
          spherical: true,
          key: "store_location.coordinates",
        },
      },
      {
        $match: { userId: userIdObjectId },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "subCategory",
          foreignField: "_id",
          as: "subCategoryDetails",
        },
      },
      {
        $unwind: {
          path: "$subCategoryDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "groups",
          let: { productId: { $toString: "$_id" } },
          pipeline: [
            { $match: { $expr: { $eq: ["$productId", "$$productId"] } } },
          ],
          as: "groupInfo",
        },
      },
      {
        $unwind: {
          path: "$groupInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          itemName: 1,
          postStatus: 1,
          price: 1,
          price_type: 1,
          productImage: 1,
          categoryName: "$categoryDetails.name",
          categoryImage: "$categoryDetails.image",
          subCategoryName: "$subCategoryDetails.name",
          subCategoryImage: "$subCategoryDetails.image",
          distance: {
            $cond: {
              if: { $lt: ["$distance", 1] },
              then: 0,
              else: { $divide: ["$distance", 1000] },
            },
          },
          groupInfo: 1,
          size: 1,
          itemLink: 1,
          platform: 1,
          delivery_location: 1,
          store_location: 1,
          additionalInformation: 1,
          clubStatus: 1,
          clubMembers: 1,
          clubToJoin: {
            $cond: {
              if: { $isArray: "$groupInfo.members" },
              then: { $subtract: ["$clubMembers", { $size: "$groupInfo.members" }] },
              else: { $subtract: ["$clubMembers", 1] },
            },
          },
        },
      },
    ];

    const posts = await post.aggregate(aggregatePipeline);

    if (posts.length === 0) {
      return res.status(404).json({ success: false, message: "No posts found" });
    }

    const modifiedPosts = await Promise.all(
      posts.map(async (post) => {
        let postStatus = post.postStatus;

        if (post.userId && post.userId.toString() === userId.toString()) {
          postStatus = "I created";
        } else {
          const groups = await Group.find({ members: userId, productId: post.productId });
          const isMember = groups.some(group => group.members.includes(userId));

          if (isMember) {
            postStatus = "I joined";
          }
        }

        return {
          _id: post._id,
          itemName: post.itemName,
          postStatus,
          distance: post.distance,
          categoryName: post.categoryName,
          // categoryImage: post.categoryImage,
          // subCategoryName: post.subCategoryName,
          // subCategoryImage: post.subCategoryImage,
          groupInfo: post.groupInfo,
          size: post.size,
          // itemLink: post.itemLink,
          // platform: post.platform,
          // delivery_location: post.delivery_location,
          // store_location: post.store_location,
          // additionalInformation: post.additionalInformation,
          clubMembers: post.clubMembers,
          clubToJoin: post.clubToJoin,
          productImage: post.productImage,
          status: post.clubStatus,
        };
      })
    );

    // Apply status filters
    let filteredPosts = modifiedPosts;

    if (status) {
      if (status === "I created") {
        filteredPosts = modifiedPosts.filter(post => post.postStatus === "I created");
      } else if (status === "I joined") {
        filteredPosts = modifiedPosts.filter(post => post.postStatus === "I joined");
      } else if (status === "Active" || status === "Inactive" || status === "WrapDeal") {
        filteredPosts = modifiedPosts.filter(post => post.status === status);
      } else if (status === "Full") {
        filteredPosts = modifiedPosts.filter(post => post.clubToJoin === 0);
      }
      // If status is "All", no filter is applied, all posts are returned
    }

    res.status(200).json({ success: true, message: "Posts fetched successfully", posts: filteredPosts });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.getProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    const userId = req.User._id;
    if(!userId){
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const product = await post.findById(productId)
    .populate({
      path: "userId",
      select: "firstName lastName", // Fetch user name and email along with userId
    })
      .populate({
        path: "category",
        select: "name description",
      })
      .populate({
        path: "subCategory",
        select: "name description",
      })
      .populate({
        path: "reportedBy",
        select: "name email",
      });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const productData = product.toObject(); 

    console.log(userId)

    if (userId.toString() === product.userId._id.toString()) {
      productData.isAdmin = true;
    }

    res.status(200).json({ success: true, data: productData });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getCategoryName = async (req, res) => {
  try {
    const { categoryId } = req.params;
    if (!categoryId) {
      return res.status(400).json({ success: false, message: "Category ID is required" });
    }
    const category = await CategoryModel.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found"})
      }
      const categoryResponse = {
        id: category._id,
        name: category.name,
      }
      res.status(200).json({ success: true, data: [categoryResponse] });
  }catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
