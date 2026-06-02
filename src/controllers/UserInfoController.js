const uploadOnCloudinary = require("../utils/Cloudinary.js");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const { parseUsername } = require("../utils/validators.js");
const { toUserInfo } = require("../utils/userInfo.js");
const User = require("../models/User.js");

const findUsernameConflict = async (userNameLower, excludeUserId = null) => {
  const query = { userNameLower };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  const byLower = await User.findOne(query);
  if (byLower) return byLower;

  const escaped = userNameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexQuery = {
    userName: { $regex: new RegExp(`^${escaped}$`, "i") },
  };
  if (excludeUserId) {
    regexQuery._id = { $ne: excludeUserId };
  }
  return User.findOne(regexQuery);
};

const excludeField =
  "-password -refreshToken -UserRating -homelocationChangeCount -lastHomelocationChange -emailChangeCount -lastEmailChange -phoneNumberChangeCount -lastPhoneNumberChange -googleAuthId -blockedUsers -reportCount";


exports.checkUsername = async (req, res) => {
  try {
    const parsed = parseUsername(req.query.userName);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }

    const existingUser = await findUsernameConflict(
      parsed.userNameLower,
      req.User?._id
    );

    if (existingUser) {
      return res.status(200).json({
        available: false,
        message: "Username is already taken",
      });
    }

    return res.status(200).json({
      available: true,
      message: "Username is available",
    });
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
            .json({ message: "Avatar uploaded successfully", data: toUserInfo(user) });
    } catch (error) {
        return res
            .status(500)
            .json({ error: "Unable to upload avatar. Server error!" });
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
            const parsed = parseUsername(userName);
            if (!parsed.ok) {
                return res.status(400).json({ message: parsed.message });
            }

            const isUserNameExist = await findUsernameConflict(
                parsed.userNameLower,
                userId
            );

            if (isUserNameExist) {
                return res.status(409).json({ message: "Username is already taken" });
            }

            updateDetails.userName = parsed.trimmed;
            updateDetails.userNameLower = parsed.userNameLower;
        }

        if (firstName) updateDetails.firstName = firstName.trim();
        if (lastName) updateDetails.lastName = lastName.trim();
        if (gender) updateDetails.gender = gender.trim();
        if (email) updateDetails.email = email.trim();
        if (phoneNumber != null && String(phoneNumber).trim() !== "") {
            return res.status(400).json({
                message:
                    "Phone number cannot be saved via UpdateUserDetails. Use sendOtpToVerifyMobileNumber, then verifyOtpToVerfiyMobileNumber.",
                code: "PHONE_USE_OTP_FLOW",
            });
        }
        let addressPayload = address;
        if (typeof addressPayload === "string") {
            try {
                addressPayload = JSON.parse(addressPayload);
            } catch {
                addressPayload = null;
            }
        }
        if (addressPayload && typeof addressPayload === "object") {
            if (!updateDetails.address) {
                updateDetails.address = {};
            }
            if (addressPayload.address_text != null) {
                updateDetails.address.address_text = addressPayload.address_text;
            }
            if (addressPayload.latitude != null) {
                updateDetails.address.latitude = addressPayload.latitude;
            }
            if (addressPayload.longitude != null) {
                updateDetails.address.longitude = addressPayload.longitude;
            }
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
            data: toUserInfo(updateUser),
        });
    } catch (error) {
        if (error.code === 11000 && error.keyPattern?.userNameLower) {
            return res.status(409).json({ message: "Username is already taken" });
        }
        serverErrorHandler(error, res);
    }
};