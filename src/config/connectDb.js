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
      const User = require("../models/User.js");

      await User.updateMany(
        {
          userName: { $nin: [null, ""] },
          $or: [{ userNameLower: null }, { userNameLower: { $exists: false } }],
        },
        [
          {
            $set: {
              userNameLower: { $toLower: { $trim: { input: "$userName" } } },
            },
          },
        ]
      );

      const duplicateEmailGroups = await User.aggregate([
        { $match: { email: { $nin: [null, ""] } } },
        {
          $group: {
            _id: { $toLower: { $trim: { input: "$email" } } },
            count: { $sum: 1 },
            docs: { $push: { id: "$_id", createdAt: "$createdAt" } },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]);

      const duplicateLoserIds = [];
      for (const group of duplicateEmailGroups) {
        const sorted = group.docs.sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        duplicateLoserIds.push(...sorted.slice(1).map((doc) => doc.id));
        await User.updateOne(
          { _id: sorted[0].id },
          { $set: { emailLower: group._id } }
        );
      }

      if (duplicateLoserIds.length) {
        await User.updateMany(
          { _id: { $in: duplicateLoserIds } },
          { $unset: { emailLower: "" } }
        );
      }

      if (duplicateEmailGroups.length > 0) {
        console.warn(
          `Resolved ${duplicateEmailGroups.length} duplicate email group(s) for unique index (kept oldest account per email).`
        );
      }

      try {
        await User.updateMany(
          {
            email: { $nin: [null, ""] },
            _id: { $nin: duplicateLoserIds },
            $or: [{ emailLower: null }, { emailLower: { $exists: false } }],
          },
          [
            {
              $set: {
                emailLower: { $toLower: { $trim: { input: "$email" } } },
              },
            },
          ]
        );
      } catch (backfillError) {
        console.warn("emailLower backfill warning:", backfillError.message);
      }

      await Promise.all([
        Post.syncIndexes(),
        Message.syncIndexes(),
        Group.syncIndexes(),
      ]);

      try {
        try {
          await User.collection.dropIndex("phoneNumber_1");
        } catch (dropError) {
          if (dropError.code !== 27 && dropError.codeName !== "IndexNotFound") {
            console.warn("phoneNumber index drop warning:", dropError.message);
          }
        }
        await User.syncIndexes();
      } catch (indexError) {
        console.warn("User index sync warning:", indexError.message);
      }

      console.log("MongoDB indexes synced (Post, Message, Group, User)");
    }

    return cached.conn;
  } catch (error) {
    cached.promise = null;
    console.log("MONGODB connection FAILED ", error);
    throw error;
  }
};

module.exports = connectDB;
