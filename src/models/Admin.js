const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema(
  {
    name: {type: String, required: true},
    image: {type: String, default: ""},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    role: {type: String, enum: ["Owner", "Manager"], required: true},
    permission: {type: String, enum: ["view", "edit"], default: "view"},
    deletedAt: {type: Date, default: null},
  },
  {timestamps: true}
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

module.exports = Admin;

