const Admin = require("../models/Admin.js")
const jwt = require("jsonwebtoken");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");

const dotenv = require("dotenv");
dotenv.config({
  path: "./.env",
});

exports.verifyAdminJWT = async (req, res, next) => {
  try {
    const token = req.cookies?.adminToken || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) return res.status(401).json({ error: "Admin access required" });

    const decodedToken = jwt.verify(token, process.env.ADMIN_ACCESS_TOKEN_SECRET);
    const admin = await Admin.findById(decodedToken?._id).select("-password");

    if (!admin) return res.status(401).json({ error: "Invalid Admin Access Token" });

    req.Admin = admin; // Attach admin data to request
    next();
  } catch (error) {
    serverErrorHandler(error, res);
  }
};
