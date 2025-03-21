const bcrypt = require("bcrypt");
const Admin = require("../models/Admin.js");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const validateEmail = require("../utils/Helper.js");
dotenv.config({
  path: "./.env",
});

module.exports = {
  createAdmin: async (req, res) => {
    try {
      const {name, email, password, role, permission} = req.body;

      if (!name || !email || !password || !role || !permission) {
        return res.status(400).json({error: "All fields are required"});
      }

      if (!validateEmail(email)) {
        return res.status(400).json({error: "Invalid email format"});
      }

      const existingAdmin = await Admin.findOne({email: email.toLowerCase()});
      if (existingAdmin) {
        return res.status(400).json({error: "Admin already exists with this email"});
      }

      const hashedPassword = await bcrypt.hash(password.trim(), 10);

      const newAdmin = new Admin({
        name, email: email.toLowerCase(), password: hashedPassword, role, permission: permission || "view",
      });

      await newAdmin.save();

      res.status(201).json({message: "Admin created successfully", admin: newAdmin});
    } catch (error) {
      console.error("Error creating admin:", error);
      res.status(500).json({error: error.message || "Internal server error"});
    }
  },

  loginAdmin: async (req, res) => {
    try {
      const {email, password} = req.body;

      if (!email || !password) {
        return res.status(400).json({error: "Email and password are required"});
      }

      const admin = await Admin.findOne({email: email.toLowerCase()});
      if (!admin) {
        return res.status(404).json({error: "Admin not found with this email"});
      }

      // Check if the account is deactivated
      if (admin.deletedAt) {
        return res.status(403).json({ error: "Your account has been deactivated." });
      }

      const isPasswordValid = await bcrypt.compare(password.trim(), admin.password);
      if (!isPasswordValid) {
        return res.status(401).json({error: "Incorrect password"});
      }

      const token = jwt.sign({id: admin._id, role: admin.role}, process.env.ADMIN_ACCESS_TOKEN_SECRET, {expiresIn: process.env.ADMIN_ACCESS_TOKEN_EXPIRY});

      res.status(200).json({
        message: "Login successful", token, admin,
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({error: error.message || "Internal server error"});
    }
  },


  fetchAdmin: async (req, res) => {
    try {
      const { page = 1, status } = req.body;
      const limit = 10;
      const skip = (page - 1) * limit;

      const matchStage = {};
      if (status === "deactivated") {
        matchStage.deletedAt = { $ne: null };
      } else if (status === "active") {
        matchStage.deletedAt = null;
      }

      const admins = await Admin.aggregate([
        { $match: matchStage },
        {
          $addFields: {
            rolePriority: {
              $switch: {
                branches: [
                  { case: { $eq: ["$role", "Owner"] }, then: 1 }, // Owners first
                  { case: { $eq: ["$permission", "edit"] }, then: 2 }, // Editors next
                ],
                default: 3, // Everyone else
              },
            },
          },
        },
        {
          $sort: {
            rolePriority: 1, // Owners → Editors → Others
            createdAt: -1, // Newest first within each rolePriority
          },
        },
        { $skip: skip },
        { $limit: limit },
      ]);

      const totalAdmins = await Admin.countDocuments(matchStage);

      res.status(200).json({
        message: "Admin details fetched successfully",
        currentPage: page,
        totalPages: Math.ceil(totalAdmins / limit),
        totalAdmins,
        admins,
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },

  updateAdmin: async (req, res) => {
    try {
      const {id} = req.params;
      const {name, email, role, permission} = req.body;
      if (!name?.trim() || !email?.trim() || !permission?.trim() || !role?.trim()) {
        return res.status(400).json({error: "All fields are required"});
      }

      if (!validateEmail(email)) {
        return res.status(400).json({error: "Invalid email format"});
      }

      const admin = await Admin.findById(id);
      if (!admin) {
        return res.status(404).json({error: "Admin not found"});
      }
      admin.name = name;
      admin.email = email.toLowerCase();
      admin.role = role;
      admin.permission = permission;
      await admin.save();
      res.status(200).json({message: "Admin updated successfully", admin});
    } catch (error) {
      res.status(500).json({error: error.message || "Internal server error"});
    }
  },

  deactivateAdmin: async (req, res) => {
    try {
      const {id} = req.params;
      const admin = await Admin.findById(id);

      if (!admin) {
        return res.status(404).json({error: "Admin not found"});
      }

      if (admin.deletedAt) {
        return res.status(400).json({error: "Admin is already deactivated"});
      }

      admin.deletedAt = new Date();
      await admin.save();

      res.status(200).json({message: "Admin deactivated successfully", admin});
    } catch (error) {
      console.error("Error deactivating admin:", error);
      res.status(500).json({error: error.message || "Internal server error"});
    }
  },

  restoreAdmin: async (req, res) => {
    try {
      const {id} = req.params;
      const admin = await Admin.findById(id);

      if (!admin) {
        return res.status(404).json({error: "Admin not found"});
      }

      if (!admin.deletedAt) {
        return res.status(400).json({error: "Admin is already active"});
      }

      admin.deletedAt = null;
      await admin.save();

      res.status(200).json({message: "Admin restored successfully", admin});
    } catch (error) {
      console.error("Error restoring admin:", error);
      res.status(500).json({error: error.message || "Internal server error"});
    }
  },

};
