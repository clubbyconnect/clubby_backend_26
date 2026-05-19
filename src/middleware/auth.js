
const jwt = require("jsonwebtoken");
const User = require("../models/User.js")
const serverErrorHandler = require("../utils/ServerErrorHandler.js");

exports.verifyJWT = async (req, res, next) => {
  try {
    console.log(req.headers)
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
    console.log('is this ', req.header("Authorization")?.replace("Bearer ", ""))

    if (!token) return res.status(401).json({ error: "Pls signIn..." });

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    const user = await User.findById(decodedToken?._id).select("-password -refreshToken")

    if (!user) return res.status(401).json({ error: "Invalid Access Token" });

    // Check if the account is deactivated by an admin
    if (user.deletedAt && user.deactivatedByAdminId) {
      return res.status(403).json({ error: "Your account has been deactivated by an admin." });
    }

    req.User = user;
    next()
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        message:
          error.name === "TokenExpiredError"
            ? "Session expired. Please sign in again."
            : "Invalid session. Please sign in again.",
      });
    }
    serverErrorHandler(error, res);
  }
};

