const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./src/config/connectDb.js");

const app = express();

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

//global midellware
app.use(cors({ origin: "*", credentials: true, }));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.use(async (req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  try {
    await connectDB();
    next();
  } catch (error) {
    console.log("Unable to connect to database", error);
    res.status(500).json({ error: "Database unavailable" });
  }
});

//import routers
const userRoutes = require("./src/routes/UserRoute.js");
const adminRoutes = require("./src/routes/AdminRoute.js");
const authRoutes = require("./src/routes/AuthRoute.js");

//routes declaration
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);

module.exports = app;




