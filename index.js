
const dotenv = require("dotenv");
dotenv.config({
  path: "./.env",
});

const connectDB = require("./src/config/connectDb.js");
const app = require("./app.js");

let dbReady = false;

app.use(async (req, res, next) => {
  if (dbReady) return next();
  try {
    await connectDB();
    dbReady = true;
    next();
  } catch (error) {
    console.log("Unable to connect to database", error);
    res.status(500).json({ error: "Database unavailable" });
  }
});

module.exports = app;

if (require.main === module) {
  const { setupSocket } = require("./src/sockets/Index.js");
  const http = require("http");
  const server = http.createServer(app);

  connectDB()
    .then(() => {
      dbReady = true;
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
