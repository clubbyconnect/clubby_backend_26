const otpGenerator = require("otp-generator");
const axios = require("axios");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const User = require("../models/User.js");
const OTP = require("../models/Otp.js");
const { parsePhoneNumber } = require("../utils/validators.js");
const { toUserInfo } = require("../utils/userInfo.js");


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
    const fast2SMSurl = process.env.FAST2SMS_URL;
    const fast2SMSapiKey = process.env.FAST2SMS_API_KEY;

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

exports.sendOtp = async (req, res) => {
    try {
        const { contact } = req.body;

        if (!contact || contact.trim() === "") {
            return res
                .status(400)
                .json({ error: "Email or phone number is required" });
        }

        const isEmailContact = /\S+@\S+\.\S+/.test(contact);
        let userQuery;
        let parsedPhone = null;

        if (isEmailContact) {
            userQuery = { email: contact };
        } else {
            parsedPhone = parsePhoneNumber(contact);
            if (!parsedPhone.ok) {
                return res.status(400).json({ error: parsedPhone.message });
            }
            userQuery = { phoneNumber: parsedPhone.value };
        }

        const user = await User.findOne(userQuery);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const otp = await generateUniqueOtp();

        const otpPayload = isEmailContact
            ? { email: contact, otp }
            : { phoneNumber: parsedPhone.digits, otp };
        await OTP.create(otpPayload);

        if (isEmailContact) {
            return res
                .status(200)
                .json({ success: true, message: "OTP Sent Successfully" });
        }

        await sendSms(parsedPhone.digits, otp);
        return res
            .status(200)
            .json({ success: true, message: "OTP Sent Successfully" });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};

exports.sendOtpToVerifyMobileNumber = async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        const parsedPhone = parsePhoneNumber(phoneNumber);
        if (!parsedPhone.ok) {
            return res.status(400).json({ error: parsedPhone.message });
        }

        const existingUser = await User.findOne({
            phoneNumber: parsedPhone.value,
            _id: { $ne: req.User._id },
        });
        if (existingUser) {
            return res.status(409).json({ message: "Phone number already in use" });
        }

        const existingOtp = await OTP.findOne({ phoneNumber: parsedPhone.digits });

        if (existingOtp) {
            return res
                .status(400)
                .json({ error: "OTP already sent pls try after some time" });
        }

        const otp = await generateUniqueOtp();

        const otpPayload = { phoneNumber: parsedPhone.digits, otp };
        await OTP.create(otpPayload);

        await sendSms(parsedPhone.digits, otp);
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

        const parsedPhone = parsePhoneNumber(phoneNumber);
        if (!parsedPhone.ok) {
            return res.status(400).json({ error: parsedPhone.message });
        }

        const otpRecord = await OTP.findOne({
            phoneNumber: parsedPhone.digits,
            otp,
        });

        if (!otpRecord) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        const userId = req.User._id;

        const phoneTaken = await User.findOne({
            phoneNumber: parsedPhone.value,
            _id: { $ne: userId },
        });
        if (phoneTaken) {
            return res.status(409).json({ message: "Phone number already in use" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    phoneNumber: parsedPhone.value,
                    phoneNumberVerified: true,
                },
            },
            { new: true },
        ).select("-password -refreshToken");

        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        await OTP.deleteOne({ _id: otpRecord._id });

        return res.status(200).json({
            message: "OTP verified successfully",
            data: toUserInfo(updatedUser),
        });
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

        const isEmailContact = /\S+@\S+\.\S+/.test(contact);
        let otpRecord;

        if (isEmailContact) {
            otpRecord = await OTP.findOne({ email: contact, otp });
        } else {
            const parsedPhone = parsePhoneNumber(contact);
            if (!parsedPhone.ok) {
                return res.status(400).json({ error: parsedPhone.message });
            }
            otpRecord = await OTP.findOne({
                phoneNumber: parsedPhone.digits,
                otp,
            });
        }

        if (!otpRecord) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        if (isEmailContact) {
            await User.updateOne(
                { email: { $regex: new RegExp(`^${String(contact).trim()}$`, "i") } },
                { $set: { emailVerified: true } },
            );
        }

        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(200).json({ message: "OTP verified successfully" });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};
