const mongoose = require("mongoose");

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
  }

  try {
    cached.conn = await cached.promise;
    console.log(`MongoDB connected !! DB HOST : ${cached.conn.connection.host}`);

    if (process.env.SYNC_INDEXES !== "false") {
      const Post = require("../models/Post.js");
      const Message = require("../models/Message.js");
      const Group = require("../models/Group.js");
      await Promise.all([
        Post.syncIndexes(),
        Message.syncIndexes(),
        Group.syncIndexes(),
      ]);
      console.log("MongoDB indexes synced (Post, Message, Group)");
    }

    return cached.conn;
  } catch (error) {
    cached.promise = null;
    console.log("MONGODB connection FAILED ", error);
    throw error;
  }
};

module.exports = connectDB;
