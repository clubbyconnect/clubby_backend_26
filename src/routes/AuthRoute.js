const express = require("express");
const router = express.Router();
const { signIn } = require("../controllers/AuthController.js");

router.post("/login", signIn);

module.exports = router;
