const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();

//global midellware
app.use(cors({origin: "*",credentials: true,}));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

//import routers
const userRoutes = require("./src/routes/user.routes.js");
const chatRoutes = require("./src/routes/chat.routes.js");
const adminRoutes = require("./src/routes/admin.routes.js");

//routes declaration
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);


module.exports = app;
