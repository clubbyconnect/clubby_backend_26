
const dotenv = require("dotenv");
dotenv.config({
  path: "./.env",
});

let app;

try {
  app = require("./app.js");
} catch (startupError) {
  console.error("Failed to load application:", startupError);
  const express = require("express");
  app = express();
  app.use((req, res) => {
    res.status(500).json({
      error: "Application failed to start",
      message: startupError.message,
    });
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

module.exports = app;

if (!process.env.VERCEL && require.main === module) {
  const connectDB = require("./src/config/connectDb.js");
  const { setupSocket } = require("./src/sockets/Index.js");
  const http = require("http");
  const server = http.createServer(app);

  connectDB()
    .then(() => {
      server.listen(process.env.PORT || 8000, () => {
        console.log(`Server is listening on port ${process.env.PORT}`);
      });
      setupSocket(server);
    })
    .catch((error) => {
      console.log("Unable to start server", error);
      process.exit(1);
    });
}
