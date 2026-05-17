
const dotenv = require("dotenv");
dotenv.config({
  path: "./.env",
});

const connectDB = require("./src/config/connectDb.js");
const app = require("./app.js");

module.exports = app;

if (!process.env.VERCEL && require.main === module) {
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
