const otpGenerator = require("otp-generator");
const axios = require("axios");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const User = require("../models/User.js");
const OTP = require("../models/Otp.js");
const { parseEmail, parsePhoneNumber } = require("../utils/validators.js");
const { toUserInfo } = require("../utils/userInfo.js");
const generateAccessAndRefreshTokens = require("../utils/RefreshToken.js");
const { assertLoginAllowed } = require("../utils/accountDeletion.js");

const isUnifiedAuthFlow = (authFlow) =>
    authFlow === "auth" || authFlow === "signin" || authFlow === "signup";

const isDeactivatedByAdmin = (user) =>
    Boolean(user?.deletedAt && user?.deactivatedByAdminId);

const findUserByEmail = async (email) => {
    const parsed = parseEmail(email);
    if (!parsed.ok) {
        return null;
    }
    const byLower = await User.findOne({ emailLower: parsed.emailLower });
    if (byLower) {
        return byLower;
    }
    return User.findOne({
        email: { $regex: new RegExp(`^${parsed.trimmed}$`, "i") },
    });
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
    } catch (error) {
        console.error("Error sending SMS via Fast2SMS:", error);
        throw new Error("Failed to send SMS: " + error.message);
    }
};

exports.sendOtp = async (req, res) => {
    try {
        const { contact, authFlow } = req.body;
        const unifiedAuth = isUnifiedAuthFlow(authFlow);

        if (!contact || contact.trim() === "") {
            return res
                .status(400)
                .json({ error: "Email or phone number is required" });
        }

        const isEmailContact = /\S+@\S+\.\S+/.test(contact);
        let parsedPhone = null;
        let parsedEmail = null;
        let otpLookup = {};

        if (isEmailContact) {
            parsedEmail = parseEmail(contact);
            if (!parsedEmail.ok) {
                return res.status(400).json({ error: parsedEmail.message });
            }
            otpLookup = { email: parsedEmail.trimmed };
        } else {
            parsedPhone = parsePhoneNumber(contact);
            if (!parsedPhone.ok) {
                return res.status(400).json({ error: parsedPhone.message });
            }
            otpLookup = { phoneNumber: parsedPhone.digits };
        }

        const existingUser = isEmailContact
            ? await findUserByEmail(contact)
            : await User.findOne({ phoneNumber: parsedPhone.value });

        if (!unifiedAuth) {
            if (!existingUser) {
                return res.status(404).json({ error: "User not found" });
            }
        } else if (isDeactivatedByAdmin(existingUser)) {
            return res.status(403).json({
                error: "Your account has been deactivated by an admin.",
            });
        }

        const testNumber = process.env.TEST_OTP_NUMBER;
        const testCode = process.env.TEST_OTP_CODE;
        if (
            testNumber &&
            testCode &&
            parsedPhone &&
            parsedPhone.digits.slice(-10) === testNumber
        ) {
            await OTP.deleteMany(otpLookup);
            await OTP.create({ ...otpLookup, otp: testCode });
            return res.status(200).json({
                success: true,
                message: "OTP Sent Successfully",
            });
        }

        const existingOtp = await OTP.findOne(otpLookup);
        if (existingOtp) {
            return res
                .status(400)
                .json({ error: "OTP already sent pls try after some time" });
        }

        const otp = await generateUniqueOtp();
        const otpPayload = { ...otpLookup, otp };

        try {
            await OTP.create(otpPayload);
        } catch (mailError) {
            if (isEmailContact) {
                console.error("sendOtp email delivery failed:", mailError?.message || mailError);
                return res.status(500).json({
                    error:
                        "Unable to send verification email. Configure MAIL_HOST, MAIL_USER, and MAIL_PASS in .env (use a Gmail App Password).",
                });
            }
            throw mailError;
        }

        if (!isEmailContact) {
            await sendSms(parsedPhone.digits, otp);
        }

        return res.status(200).json({
            success: true,
            message: "OTP Sent Successfully",
        });
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
        const { contact, otp, authFlow, deviceType, fcmToken, termsAccepted } =
            req.body;
        const unifiedAuth = isUnifiedAuthFlow(authFlow);

        if (!contact || !otp) {
            return res.status(400).json({ error: "Contact and OTP are required" });
        }

        const isEmailContact = /\S+@\S+\.\S+/.test(contact);
        let otpRecord;
        let parsedPhone = null;
        let parsedEmail = null;

        if (isEmailContact) {
            parsedEmail = parseEmail(contact);
            if (!parsedEmail.ok) {
                return res.status(400).json({ error: parsedEmail.message });
            }
            otpRecord = await OTP.findOne({
                email: parsedEmail.trimmed,
                otp,
            });
        } else {
            parsedPhone = parsePhoneNumber(contact);
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

        if (unifiedAuth) {
            let user = isEmailContact
                ? await findUserByEmail(parsedEmail.trimmed)
                : await User.findOne({ phoneNumber: parsedPhone.value });

            if (isDeactivatedByAdmin(user)) {
                return res.status(403).json({
                    error: "Your account has been deactivated by an admin.",
                });
            }

            if (user) {
                const loginCheck = assertLoginAllowed(user);
                if (!loginCheck.ok) {
                    return res.status(loginCheck.status).json({ error: loginCheck.error });
                }
            }

            if (!user && termsAccepted !== true) {
                return res.status(400).json({
                    error: "You must accept the terms and conditions",
                });
            }
        }

        await OTP.deleteOne({ _id: otpRecord._id });

        if (unifiedAuth) {
            let user = isEmailContact
                ? await findUserByEmail(parsedEmail.trimmed)
                : await User.findOne({ phoneNumber: parsedPhone.value });

            let isNewUser = false;

            if (!user) {
                isNewUser = true;
                if (isEmailContact) {
                    user = await User.create({
                        email: parsedEmail.trimmed,
                        emailLower: parsedEmail.emailLower,
                        signupMethod: "email",
                        emailVerified: true,
                        deviceType: deviceType || null,
                        fcmToken: fcmToken || null,
                    });
                } else {
                    user = await User.create({
                        phoneNumber: parsedPhone.value,
                        signupMethod: "phone",
                        phoneNumberVerified: true,
                        deviceType: deviceType || null,
                        fcmToken: fcmToken || null,
                    });
                }
            } else {
                if (isEmailContact) {
                    user.emailVerified = true;
                } else {
                    user.phoneNumber = parsedPhone.value;
                    user.phoneNumberVerified = true;
                }
                if (deviceType) {
                    user.deviceType = deviceType;
                }
                if (fcmToken) {
                    user.fcmToken = fcmToken;
                }
                await user.save({ validateBeforeSave: false });
            }

            const { accessToken, refreshToken } =
                await generateAccessAndRefreshTokens(user._id);
            const loggedInUser = await User.findById(user._id).select(
                "-password -refreshToken",
            );

            const options = { httpOnly: true, secure: true };

            return res
                .status(200)
                .cookie("accessToken", accessToken, options)
                .cookie("refreshToken", refreshToken, options)
                .json({
                    message: isNewUser
                        ? "User registered successfully"
                        : "User signed in successfully",
                    isNewUser,
                    token: accessToken,
                    accessToken,
                    data: {
                        accessToken,
                        userInfo: toUserInfo(loggedInUser),
                    },
                });
        }

        if (isEmailContact) {
            await User.updateOne(
                { 
                    email: {
                        $regex: new RegExp(
                            `^${String(parsedEmail?.trimmed ?? contact).trim()}$`,
                            "i",
                        ),
                    },
                },
                { $set: { emailVerified: true } },
            );
        }

        return res.status(200).json({ message: "OTP verified successfully" });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "This contact is already linked to an account",
            });
        }
        serverErrorHandler(error, res);
    }
};
