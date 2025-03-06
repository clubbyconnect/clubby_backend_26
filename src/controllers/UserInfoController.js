
const mongoose = require('mongoose');
const uploadOnCloudinary = require("../utils/Cloudinary.js");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const User = require("../models/User.js");


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