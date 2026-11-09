const { OAuth2Client } = require("google-auth-library");
const verifyAppleIdToken = require("../utils/verifyAppleIdToken.js");
const Facebook = require("facebook-node-sdk");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const { parseEmail, parsePhoneNumber } = require("../utils/validators.js");
const { toUserInfo } = require("../utils/userInfo.js");
const User = require("../models/User.js");
const generateAccessAndRefreshTokens = require("../utils/RefreshToken.js")
const { assertLoginAllowed } = require("../utils/accountDeletion.js");

const excludeField = "-password -refreshToken -UserRating -homelocationChangeCount -lastHomelocationChange -emailChangeCount -lastEmailChange -phoneNumberChangeCount -lastPhoneNumberChange -googleAuthId -blockedUsers -reportCount -refreshToken";


const fb = new Facebook({
    appId: process.env.FACEBOOK_APP_ID,
    secret: process.env.FACEBOOK_APP_SECRET,
});

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const findEmailConflict = async (emailLower) => {
    const byLower = await User.findOne({ emailLower });
    if (byLower) return byLower;

    const escaped = emailLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return User.findOne({
        email: { $regex: new RegExp(`^${escaped}$`, "i") },
    });
};


const findPhoneConflict = async (phoneValue) =>
  User.findOne({ phoneNumber: phoneValue });


exports.checkEmail = async (req, res) => {
    try {
        const parsed = parseEmail(req.query.email);
        if (!parsed.ok) {
            return res.status(400).json({ message: parsed.message });
        }

        const existingUser = await findEmailConflict(parsed.emailLower);
        if (existingUser) {
            return res.status(200).json({
                available: false,
                message: "This email already has an account",
            });
        }

        return res.status(200).json({
            available: true,
            message: "Email is available",
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};

exports.signUp = async (req, res) => {
    try {
        const {
            email,
            phoneNumber,
            confirmPassword,
            password,
            deviceType,
            fcmToken,
        } = req.body;

        if (
            [confirmPassword, password, deviceType, fcmToken].some(
                (field) => field?.trim?.() === "" || field == null,
            )
        ) {
            return res.status(400).json({ error: "All fields are required" });
        }

        if (!email && !phoneNumber) {
            return res.status(400).json({
                error: "Either email or phoneNumber is required",
            });
        }

        if (email && phoneNumber) {
            return res.status(400).json({
                error: "Provide either email or phoneNumber, not both",
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: "Passwords do not match" });
        }

        let newUser;

        if (email) {
            const parsed = parseEmail(email);
            if (!parsed.ok) {
                return res.status(400).json({ message: parsed.message });
            }

            const existingUser = await findEmailConflict(parsed.emailLower);
            if (existingUser) {
                return res.status(409).json({
                    message: "This email already has an account",
                });
            }

            newUser = await User.create({
                email: parsed.trimmed,
                emailLower: parsed.emailLower,
                password,
                deviceType,
                fcmToken,
                signupMethod: "email",
            });
        } else {
            const parsedPhone = parsePhoneNumber(phoneNumber);
            if (!parsedPhone.ok) {
                return res.status(400).json({ message: parsedPhone.message });
            }

            const existingPhone = await findPhoneConflict(parsedPhone.value);
            if (existingPhone) {
                return res.status(409).json({
                    message: "This phone number already has an account",
                });
            }

            newUser = await User.create({
                phoneNumber: parsedPhone.value,
                password,
                deviceType,
                fcmToken,
                signupMethod: "phone",
                phoneNumberVerified: false,
            });
        }

        const user = await User.findById(newUser._id).select("-password -refreshToken");

        if (!user) {
            return res
                .status(500)
                .json({ error: "Something went wrong while registering the user" });
        }

        const { accessToken } = await generateAccessAndRefreshTokens(user._id);

        return res.status(200).json({
            message: "User registered successfully",
            data: { accessToken, userInfo: toUserInfo(user) },
        });
    } catch (error) {
        if (error.code === 11000) {
            if (error.keyPattern?.emailLower) {
                return res.status(409).json({ message: "This email already has an account" });
            }
            if (error.keyPattern?.phoneNumber) {
                return res.status(409).json({ message: "This phone number already has an account" });
            }
        }
        serverErrorHandler(error, res);
    }
};


exports.signIn = async (req, res) => {
    try {
        const { email, phoneNumber, password, deviceType, fcmToken } = req.body;

        if (!password || (!email && !phoneNumber)) {
            return res.status(400).json({
                error: "Password and either email or phoneNumber are required",
            });
        }

        if (email && phoneNumber) {
            return res.status(400).json({
                error: "Provide either email or phoneNumber, not both",
            });
        }

        let user;
        if (email) {
            user = await User.findOne({
                email: { $regex: new RegExp(`^${String(email).trim()}$`, "i") },
            });
        } else {
            const parsedPhone = parsePhoneNumber(phoneNumber);
            if (!parsedPhone.ok) {
                return res.status(400).json({ error: parsedPhone.message });
            }
            user = await User.findOne({ phoneNumber: parsedPhone.value });
        }

        if (!user) {
            return res.status(404).json({ error: "User does not exist" });
        }

        // Check if the account is deactivated
        if (user.deletedAt && user.deactivatedByAdminId) {
            return res.status(403).json({ error: "Your account has been deactivated by an admin." });
        }

        const loginCheck = assertLoginAllowed(user);
        if (!loginCheck.ok) {
            return res.status(loginCheck.status).json({ error: loginCheck.error });
        }

        // Validate password
        const isPasswordValid = await user.isPasswordCorrect(password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid user credentials" });
        }

        if (deviceType) user.deviceType = deviceType;
        if (fcmToken) user.fcmToken = fcmToken;
        if (deviceType || fcmToken) {
            await user.save({ validateBeforeSave: false });
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
        const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

        const options = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json({
                message: "User signed in successfully",
                token: accessToken,
                accessToken,
                data: { accessToken, userInfo: toUserInfo(loggedInUser) },
            });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};


exports.googleAuth = async (req, res) => {
    try {
        const { token, deviceType, fcmToken } = req.body;

        if (!token || !deviceType) {
            return res.status(400).json({ error: "Token and deviceType are required" });
        }

        const audiences = [
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_ANDROID_CLIENT_ID,
        ].filter(Boolean);

        let result;
        try {
            result = await client.verifyIdToken({
                idToken: token,
                audience: audiences.length === 1 ? audiences[0] : audiences,
            });
        } catch (verifyError) {
            const hint =
                verifyError?.message?.includes("audience")
                    ? " GOOGLE_CLIENT_ID in .env must match the app Web client (463251283140-...ld3pg0.apps.googleusercontent.com from google-services.json)."
                    : "";
            return res.status(500).json({
                message: (verifyError?.message || "Google token verification failed") + hint,
            });
        }

        const googleAuthId = result.payload.sub;
        const email = result.payload.email?.toLowerCase?.() ?? result.payload.email;

        let user = await User.findOne({ googleAuthId });
        let isNewUser = false;

        if (!user && email) {
            user = await User.findOne({
                email: { $regex: new RegExp(`^${email}$`, "i") },
            });
            if (user) {
                if (user.googleAuthId && user.googleAuthId !== googleAuthId) {
                    return res.status(409).json({
                        error: "This email is linked to a different Google account.",
                    });
                }
                user.googleAuthId = googleAuthId;
                if (!user.emailVerified) user.emailVerified = true;
            }
        }

        if (user?.deletedAt && user?.deactivatedByAdminId) {
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

        if (!user) {
            const newUser = await User.create({
                email,
                emailLower: email?.toLowerCase?.() ?? email,
                googleAuthId,
                deviceType,
                fcmToken,
                signupMethod: "email",
                emailVerified: true,
            });
            user = await User.findById(newUser._id).select("-password -refreshToken");
            isNewUser = true;
        } else {
            user.deviceType = deviceType;
            if (fcmToken) user.fcmToken = fcmToken;
            await user.save({ validateBeforeSave: false });
        }

        // Generate tokens
        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
        const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

        // Set cookies
        const options = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json({
                message: isNewUser
                    ? "User Created and signed in successfully"
                    : "User signed in successfully",
                token: accessToken,
                accessToken,
                data: { accessToken, userInfo: toUserInfo(loggedInUser, { includeAuthIds: true }) },
            });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};

exports.appleAuth = async (req, res) => {
    try {
        const { idToken, token, deviceType, fcmToken, user: appleProfile } = req.body;
        const appleIdToken = idToken || token;

        if (!appleIdToken || !deviceType || !fcmToken) {
            return res.status(400).json({ error: "All fields are required" });
        }

        if (!process.env.APPLE_CLIENT_ID) {
            return res.status(500).json({ error: "Apple Sign-In is not configured" });
        }

        const payload = await verifyAppleIdToken(
            appleIdToken,
            process.env.APPLE_CLIENT_ID
        );

        const appleAuthId = payload.sub;
        const emailFromToken = payload.email;

        let profile = appleProfile;
        if (typeof profile === "string") {
            try {
                profile = JSON.parse(profile);
            } catch {
                profile = null;
            }
        }

        const emailFromProfile = profile?.email;
        const email = emailFromToken || emailFromProfile;

        let user = await User.findOne({ appleAuthId });
        let isNewUser = false;

        if (!user && email) {
            user = await User.findOne({
                email: { $regex: new RegExp(`^${email}$`, "i") },
            });
            if (user) {
                user.appleAuthId = appleAuthId;
            }
        }

        if (user?.deletedAt && user?.deactivatedByAdminId) {
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

        if (!user) {
            if (!email) {
                return res.status(400).json({
                    error: "Email is required for first-time Apple Sign-In",
                });
            }

            const createData = {
                email,
                emailLower: email?.toLowerCase?.() ?? email,
                appleAuthId,
                deviceType,
                fcmToken,
                signupMethod: "email",
                emailVerified: true,
            };

            if (profile?.name?.firstName) createData.firstName = profile.name.firstName;
            if (profile?.name?.lastName) createData.lastName = profile.name.lastName;

            const newUser = await User.create(createData);
            user = await User.findById(newUser._id).select("-password -refreshToken");
            isNewUser = true;
        } else {
            user.deviceType = deviceType;
            user.fcmToken = fcmToken;
            if (!user.appleAuthId) user.appleAuthId = appleAuthId;
            if (!user.emailVerified) user.emailVerified = true;
            await user.save({ validateBeforeSave: false });
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
        const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

        const options = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json({
                message: isNewUser
                    ? "User Created and signed in successfully"
                    : "User signed in successfully",
                token: accessToken,
                accessToken,
                data: { accessToken, userInfo: toUserInfo(loggedInUser, { includeAuthIds: true }) },
            });
    } catch (error) {
        console.error("Apple auth error:", error);
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Invalid Apple identity token" });
        }
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


exports.logout = async (req, res) => {
    try {
        const userId = req.User._id; // Assuming user is authenticated and attached to req
        // Find the user and remove deviceType and fcmToken
        const user = await User.findByIdAndUpdate(
            userId,
            { $unset: { deviceType: "", fcmToken: "" } },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }


        return res.status(200).json({
            message: "User logged out successfully",
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};

exports.getPasswordSettings = async (req, res) => {
    try {
        const user = await User.findById(req.User._id).select(
            "googleAuthId appleAuthId",
        );
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        let authProvider = "email";
        if (user.googleAuthId) {
            authProvider = "google";
        } else if (user.appleAuthId) {
            authProvider = "apple";
        }

        return res.status(200).json({
            canChangePassword: authProvider === "email",
            authProvider,
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (
            [currentPassword, newPassword, confirmPassword].some(
                (field) => !field || String(field).trim() === "",
            )
        ) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const user = await User.findById(req.User._id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.googleAuthId) {
            return res.status(403).json({
                error:
                    "You signed in with Google. Password cannot be changed here.",
                code: "SOCIAL_AUTH_ACCOUNT",
            });
        }

        if (user.appleAuthId) {
            return res.status(403).json({
                error:
                    "You signed in with Apple. Password cannot be changed here.",
                code: "SOCIAL_AUTH_ACCOUNT",
            });
        }

        const currentOk = await user.isPasswordCorrect(currentPassword);
        if (!currentOk) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        if (String(newPassword).length < 8) {
            return res.status(400).json({
                error: "New password must be at least 8 characters",
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: "Passwords do not match" });
        }

        const sameAsCurrent = await user.isPasswordCorrect(newPassword);
        if (sameAsCurrent) {
            return res.status(400).json({
                error: "New password must be different from your current password",
            });
        }

        user.password = newPassword;
        await user.save({ validateBeforeSave: false });

        return res.status(200).json({ message: "Password changed successfully" });
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

        let user;
        if (isEmail) {
            user = await User.findOne({
                email: { $regex: new RegExp(`^${String(contact).trim()}$`, "i") },
            });
        } else {
            const parsedPhone = parsePhoneNumber(contact);
            if (!parsedPhone.ok) {
                return res.status(400).json({ error: parsedPhone.message });
            }
            user = await User.findOne({ phoneNumber: parsedPhone.value });
        }

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
