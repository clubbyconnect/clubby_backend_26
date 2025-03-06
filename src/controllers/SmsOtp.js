const otpGenerator = require("otp-generator");
const axios = require("axios");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const User = require("../models/User.js");
const OTP = require("../models/Otp.js");


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

        const email = /\S+@\S+\.\S+/.test(contact);
        const userQuery = email ? { email: contact } : { phoneNumber: contact };

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
