const otpGenerator = require("otp-generator");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");
const Facebook = require("facebook-node-sdk");
const { appleAuth } = require("apple-auth");
const ErrorHandler = require("../utils/ErrorHandler.js");
const uploadOnCloudinary = require("../utils/cloudinary.js");
const handleValidationError = require("../utils/mongooseErrorHandler.js");
const User = require("../models/user.js");
const OTP = require("../models/otp.js");
const post = require("../models/post.js");
const categoryModel = require("../models/categorySchema.js");
const clubRequest = require("../models/clubRequest.js");
const chatRoom = require("../models/chatRoom.js")


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
  "-password -refreshToken -UserRating -homelocationChangeCount -lastHomelocationChange -emailChangeCount -lastEmailChange -mobileNoChangeCount -lastMobileNoChange -googleAuthId -blockedUsers -reportCount -refreshToken";

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
  const response = await axios.post(
    fast2SMSurl,
    {
      route: "v3",
      sender_id: "TXTIND",
      message,
      language: "english",
      flash: 0,
      numbers: phoneNumber,
    },
    {
      headers: {
        authorization: fast2SMSapiKey,
        "Content-Type": "application/json",
      },
    }
  );
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
    handleValidationError(error, res);
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
    console.log(error);
    new ErrorHandler("An error occurred", 500, res);
  }
};

exports.appleAuth = async (req, res) => {
  try {
    const { idToken, user } = req.body;
    const userInfo = await appleAuth.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: true,
    });

    console.log(userInfo);
  } catch (error) {
    new ErrorHandler("Unable to logout. Server error!", 500, res);
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
    new ErrorHandler("Unable to logout. Server error!", 500, res);
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
      return res.status(409).json({ error: "User does not exist" });
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
    handleValidationError(error, res);
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

    const user = await User.findOne({
      $or: [{ email: contact }, { phoneNumber: contact }],
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isEmail = user.email === contact;
    const otp = await generateUniqueOtp();

    const otpPayload = isEmail
      ? { email: contact, otp }
      : { mobileNumber: contact, otp };
    await OTP.create(otpPayload);

    if (isEmail) {
      return res
        .status(200)
        .json({ success: true, message: "OTP Sent Successfully" });
    } else {
      const message = `Your OTP is ${otp}`;
      await sendSms(contact, message);
      return res
        .status(200)
        .json({ success: true, message: "OTP Sent Successfully" });
    }
  } catch (error) {
    handleValidationError(error, res);
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { contact, otp } = req.body;
    if (!contact || !otp) {
      return res.status(400).json({ error: "Contact and OTP are required" });
    }

    const user = await User.findOne({
      $or: [{ email: contact }, { phoneNumber: contact }],
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid OTP" });
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
    new ErrorHandler("An error occurred during sign in", 500, res);
  }
};

exports.logout = async (req, res) => {
  try {
    console.log(req);
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
    console.log(error);
    new ErrorHandler("Unable to logout. Server error!", 500, res);
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
    const user = await User.findOne({
      $or: [{ email: contact }, { phoneNumber: contact }],
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.googleAuthId !== null) {
      return res.status(409).json({
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
    handleValidationError(error, res);
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
      return res
        .status(500)
        .json({ message: "Unable to upload profile photo" });
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
    console.error(error);
    return res
      .status(500)
      .json({ message: "Unable to upload avatar. Server error!" });
  }
};

exports.createPost = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      quantity,
      productLink,
      location,
      NumberOfclubMenber,
      clubType,
      OfferType,
      category,
      subcategory,
      subsubcategory,
    } = req.body;

    if (
      [
        title,
        description,
        price,
        quantity,
        category,
        subcategory,
        productLink,
        location,
        NumberOfclubMenber,
        clubType,
        OfferType,
      ].some((field) => field?.trim() === "")
    ) {
      return res.status(400).json({ error: "pls fill required fields" });
    }
    const productImageLocalPath = req.file?.path;
    if (!productImageLocalPath)
      return res.status(400).json({ message: "Product Image is requierd" });

    const productImage = await uploadOnCloudinary(productImageLocalPath);

    const categoryid = await categoryModel.findOne({ name: category });
    const subcategoryid = await categoryModel.findOne({ name: category });
    const subsubcategoryid = await categoryModel.findOne({
      name: subsubcategory,
    });

    const postData = {
      userId: req.User._id,
      title,
      description,
      price,
      quantity,
      category,
      subcategory,
      productLink,
      location,
      NumberOfclubMenber,
      clubType,
      OfferType,
      category: categoryid._id,
      subcategory: subcategoryid._id,
      productImage: productImage.url,
    };

    if (subsubcategory && subsubcategoryid) {
      postData.subsubcategory = subsubcategoryid._id;
    }

    const createdPost = await post.create(postData);
    if (!createdPost._id)
      return res.status(401).json({ messaage: "unabel to create post" });

    return res.status(401).json({ messaage: "Post created Sucessfully" });
  } catch (error) {
    handleValidationError(error, res);
  }
};

exports.UpdateUserDetails = async (req, res) => {
  try {
    const { firstName, lastName, gender, password, email } = req.body;
    const userId = req.User._id;

    let updateDetails = await User.findById(userId);

    if (password) {
      const isPasswordValid = await updateDetails.isPasswordCorrect(password);
      if (isPasswordValid) {
        updateDetails.password = password;
      } else {
        return res.status(400).json({ message: "Invalid password" });
      }
    }

    const avatarLocalPath = req.file?.path;
    if (avatarLocalPath) {
      const avatar = await uploadOnCloudinary(avatarLocalPath);
      if (!avatar) {
        return res.status(400).json({ message: "Unable to upload avatar" });
      }
      updateDetails.avatar = avatar.secure_url;
    }

    if (firstName) updateDetails.firstName = firstName.trim();
    if (lastName) updateDetails.lastName = lastName.trim();
    if (gender) updateDetails.gender = gender.trim();
    if (email) updateDetails.email = email.trim();

    updateDetails = await updateDetails.save();
    let updateUser = await User.findById(userId).select(`${excludeField}`);

    return res.status(200).json({
      message: "User details updated successfully",
      data: updateUser,
    });
  } catch (error) {
    console.log(error);
    handleValidationError(error, res);
  }
};

//------------------------------------------User Request---------------------------------------------
exports.sendClubRequest = async (req, res) => {
  try {
    const { postId } = req.body
    const requesterId = req.User._id;

    const postData = await post.findById(postId);
    if (!postData) {
      return res.status(404).json({ message: "Post Not Found" });
    }

    if (postData.userId.equals(requesterId)) {
      console.log("same request");
      return res
        .status(404)
        .json({ message: "You can not send ClubRequest to your own Post" });
    }
    const recipientId = postData.userId;

    if (!requesterId || !recipientId) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingRequest = await clubRequest.findOne({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    if (existingRequest) {
      return res.status(400).json({ message: "Club request already sent" });
    }

    const friendRequest = await clubRequest.create({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    await friendRequest.save();
    return res.status(200).json({ message: "Club request sent" });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "Error sending Club request", error });
  }
};

exports.acceptClubRequest = async (req, res) => {
  try {
    const { requesterId, postId } = req.body;
    const recipientId = req.User._id;

    const postData = await post.findById(postId);
    if (!postData) {
      return res.status(404).json({ message: "Post Not Found" });
    }

    if (postData.userId.equals(requesterId)) {
      return res.status(400).json({
        message: "You cannot use your userId as requesterId to Accept ClubRequest",
      });
    }

    const requester = await User.findById(requesterId);
    if (!requester) {
      return res.status(404).json({ message: "Requester Not Found" });
    }

    const pendingRequest = await clubRequest.findOne({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    if (!pendingRequest) {
      return res.status(400).json({ message: "Pending Request Not Found" });
    }

    if (pendingRequest.status === "accepted") {
      return res.status(400).json({ message: "Club request already accepted" });
    }

   
    let group = await chatRoom.findOne({ roomId: postData._id });
    if (!group) {
      group = new chatRoom({
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

    return res.status(200).json({ message: "Club request accepted and added to Club chat" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Error accepting club request", error });
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
      return res.status(404).json({ message: "Post Not Found" });
    }

    if (postData.userId.equals(requesterId)) {
      return res.status(404).json({message:"You can not use your userId as requesterId to declined ClubRequest",});
    }

    const requester = await User.findById(requesterId);
    if (!requester) {
      return res.status(404).json({ message: "requester Not Found" });
    }

    const pendingRequest = await clubRequest.findOne({
      requester: requesterId,
      recipient: recipientId,
      postId,
    });

    if (pendingRequest) {
      if (pendingRequest.status === "declined")
        return res.status(400).json({ message: "Club request already declined" });
    } else {
      return res.status(400).json({ message: "Pending Request Not Found" });
    }

    pendingRequest.status = "declined";
    pendingRequest.updatedAt = Date.now();
    await pendingRequest.save();
    return res.status(200).json({ message: "club request declined" });
  } catch (error) {
    res.status(500).json({ message: "Error declining friend request", error });
  }
};
