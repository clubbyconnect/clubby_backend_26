
const jwt = require("jsonwebtoken");
const User = require("../models/user.js")
const ErrorHandler = require("../utils/ErrorHandler.js");

exports.verifyJWT = async (req, res, next) => {
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
        
        if (!token) {
            return res.status(401).json({ error: "Unauthorized request" });
        }
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")

        if (!user) {
            return res.status(401).json({ error: "Invalid Access Token" });
        }
        req.User = user;
        next()   

    } catch (error) {
        console.log(error);
      new ErrorHandler("Unable to verify JWT", 500, res);
    }
  };



