const { appleAuth } = require("apple-auth");
const { OAuth2Client } = require("google-auth-library");
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
        if (!email || !password || !deviceType || !fcmToken) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Find user with case-insensitive email search
        const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        if (!user) {
            return res.status(404).json({ error: "User does not exist" });
        }

        // Validate password
        const isPasswordValid = await user.isPasswordCorrect(password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid user credentials" });
        }

        // Update deviceType and fcmToken
        user.deviceType = deviceType;
        user.fcmToken = fcmToken;
        await user.save();

        // Generate tokens
        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
        const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

        // Set cookies
        const options = {
            httpOnly: true,
            secure: true,
        };

        res.cookie("accessToken", accessToken, options);
        res.cookie("refreshToken", refreshToken, options);

        return res.status(200).json({
            message: "User signed in successfully",
            data: { accessToken: accessToken, userInfo: loggedInUser },
        });
    } catch (error) {
        serverErrorHandler(error, res);
    }
};


exports.googleAuth = async (req, res) => {
    try {
        const { token, deviceType, fcmToken } = req.body;

        // Validate required fields
        if (!token || !deviceType || !fcmToken) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Verify Google token
        const result = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const googleAuthId = result.payload.sub;
        const email = result.payload.email;

        // Find or create user
        let user = await User.findOne({ googleAuthId });
        if (!user) {
            const newUser = await User.create({ email, googleAuthId, deviceType, fcmToken });
            user = await User.findById(newUser._id).select("-password -refreshToken");
        } else {
            // Update deviceType and fcmToken
            user.deviceType = deviceType;
            user.fcmToken = fcmToken;
            await user.save();
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
