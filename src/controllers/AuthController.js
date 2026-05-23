const { OAuth2Client } = require("google-auth-library");
const verifyAppleIdToken = require("../utils/verifyAppleIdToken.js");
const Facebook = require("facebook-node-sdk");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const User = require("../models/User.js");
const generateAccessAndRefreshTokens = require("../utils/RefreshToken.js")

const excludeField = "-password -refreshToken -UserRating -homelocationChangeCount -lastHomelocationChange -emailChangeCount -lastEmailChange -phoneNumberChangeCount -lastPhoneNumberChange -googleAuthId -blockedUsers -reportCount -refreshToken";


const fb = new Facebook({
    appId: process.env.FACEBOOK_APP_ID,
    secret: process.env.FACEBOOK_APP_SECRET,
});

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


exports.signUp = async (req, res) => {
    try {
        const { email, confirmPassword, password, deviceType, fcmToken } = req.body;

        // Validate required fields
        if (
            [confirmPassword, email, password, deviceType, fcmToken].some((field) => field?.trim() === "")
        ) {
            return res.status(400).json({ error: "All fields are required" });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: "Passwords do not match" });
        }

        // Check if user already exists
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

        // Create new user with deviceType and fcmToken
        const newUser = await User.create({ email, password, deviceType, fcmToken });
        const user = await User.findById(newUser._id).select("email deviceType fcmToken");

        if (!user) {
            return res
                .status(500)
                .json({ error: "Something went wrong while registering the user" });
        }

        // Generate tokens
        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

        return res.status(200).json({
            message: "User registered successfully",
            data: { accessToken: accessToken, userInfo: user },
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};


exports.signIn = async (req, res) => {
    try {
        const { email, password, deviceType, fcmToken } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Find user with case-insensitive email search
        const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        if (!user) {
            return res.status(404).json({ error: "User does not exist" });
        }

        // Check if the account is deactivated
        if (user.deletedAt && user.deactivatedByAdminId) {
            return res.status(403).json({ error: "Your account has been deactivated by an admin." });
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
                data: { accessToken, userInfo: loggedInUser },
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
            }
        }

        if (!user) {
            const newUser = await User.create({ email, googleAuthId, deviceType, fcmToken });
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
                data: { accessToken, userInfo: loggedInUser },
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

        if (!user) {
            if (!email) {
                return res.status(400).json({
                    error: "Email is required for first-time Apple Sign-In",
                });
            }

            const createData = {
                email,
                appleAuthId,
                deviceType,
                fcmToken,
                emailVerified: payload.email_verified === true || payload.email_verified === "true",
            };

            if (profile?.name?.firstName) createData.firstName = profile.name.firstName;
            if (profile?.name?.lastName) createData.lastName = profile.name.lastName;

            const newUser = await User.create(createData);
            user = await User.findById(newUser._id).select("-password -refreshToken");
            isNewUser = true;
        } else {
            if (user.deletedAt && user.deactivatedByAdminId) {
                return res.status(403).json({
                    error: "Your account has been deactivated by an admin.",
                });
            }
            user.deviceType = deviceType;
            user.fcmToken = fcmToken;
            if (!user.appleAuthId) user.appleAuthId = appleAuthId;
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
                data: { accessToken, userInfo: loggedInUser },
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
        console.log('req.user is ', req.User)
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
