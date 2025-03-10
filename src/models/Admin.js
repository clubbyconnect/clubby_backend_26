const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: { type: String, default: "" }, // Store image URL (Cloudinary, S3, etc.)
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["Owner", "Manager"], required: true },

    windows: {
      type: [String], // List of accessible tabs
      enum: [
        "Dashboard",
        "Content",
        "Update Category",
        "Admin Panel",
        "Blacklist Users",
        "Role Management",
        "Paid User",
        "Settings",
      ],
      default: [], // By default, no access
    },

    permission: { type: String, enum: ["view", "edit"], default: "view" }, // Single permission for all tabs

    deletedAt: { type: Date, default: null }, // Soft delete field (null = active, date = deleted)
  },
  { timestamps: true } // Enables createdAt & updatedAt fields automatically
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

module.exports = Admin;

