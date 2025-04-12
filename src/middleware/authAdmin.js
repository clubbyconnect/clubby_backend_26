const Admin = require("../models/Admin.js")
const jwt = require("jsonwebtoken");

const dotenv = require("dotenv");
dotenv.config({
  path: "./.env",
});

// Middleware to verify admin JWT
// accessLevel: 0 for all admins, 1 for edit permission required, 2 for owner role required
exports.verifyAdminJWT = (accessLevel = 0) => {
  return async (req, res, next) => {
    try {
      const token = req.header("Authorization")?.replace("Bearer ", "");
      if (!token) return res.status(401).json({error: "Admin access required"});

      const decodedToken = jwt.verify(token, process.env.ADMIN_ACCESS_TOKEN_SECRET);
      if (!decodedToken?.id) {
        return res.status(401).json({error: "Invalid Token Structure"});
      }

      const admin = await Admin.findById(decodedToken.id);
      if (!admin) return res.status(401).json({error: "Invalid Admin Access Token"});

      // Check if the account is deactivated
      if (admin.deletedAt) {
        return res.status(403).json({ error: "Your account has been deactivated." });
      }

      // Enforce access level checks
      if (accessLevel === 1 && admin.permission !== "edit") {
        return res.status(403).json({error: "Edit access required"});
      }
      if (accessLevel === 2 && admin.role !== "Owner") {
        return res.status(403).json({error: "Only owners can access this resource"});
      }

      req.Admin = admin; // Attach admin data to request
      next();
    } catch (error) {
      console.error("JWT Verification Error:", error);
      res.status(401).json({error: "Invalid or Expired Token"});
    }
  };
};


