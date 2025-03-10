const bcrypt = require("bcrypt");
const Admin = require("../models/Admin.js");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
dotenv.config({
  path: "./.env",
});

module.exports = {
  createAdmin: async (req, res) => {
    try {
      const { name, email, password, role, windows, permission } = req.body;

      if (!name || !email || !password || !role) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({ error: "Admin already exists with this email" });
      }

      const hashedPassword = await bcrypt.hash(password.trim(), 10);

      const newAdmin = new Admin({
        name,
        email,
        password: hashedPassword,
        role,
        windows: windows || [],
        permission: permission || "view",
      });

      await newAdmin.save();

      res.status(201).json({ message: "Admin created successfully", admin: newAdmin });
    } catch (error) {
      console.error("Error creating admin:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },

  loginAdmin: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(404).json({ error: "Admin not found with this email" });
      }

      const isPasswordValid = await bcrypt.compare(password.trim(), admin.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Incorrect password" });
      }

      const token = jwt.sign(
        { id: admin._id, role: admin.role },
        process.env.ADMIN_ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ADMIN_ACCESS_TOKEN_EXPIRY }
      );

      res.status(200).json({
        message: "Login successful",
        token,
        admin,
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  },
};
