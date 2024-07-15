const express = require("express");
const { handleChatMessage } = require("../controllers/chat.controller.js");

const router = express.Router();

// chat
router.post("/message", handleChatMessage);

module.exports = router;
