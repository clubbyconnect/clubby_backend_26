const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const validator = require("validator");


const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email address",
      ],
    },
    password: {
      type: String,
      minlength: [8, "Password should be at least 8 characters long"],
    },
    googleAuthId: {
      type: String,
      default : null
    },
    avatar: {
      type: String,
      default : "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721114085/fk9iazynubn9toe8yrrq.png"
    },
    isVerified: {
      type: String,
      default : false
    },
    MobileNo: {
      type: String,
      default : null
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Hashing password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const hashedPassword = await bcrypt.hash(this.password, 10);
    this.password = hashedPassword;
    next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

const User = mongoose.model("user", userSchema);
module.exports = User;


// [
//   {
//     "email": "john.doe@example.com",
//     "password": "hashedpassword123",
//     "googleId": "google-12345",
//     "name": "John Doe",
//     "profileImage": "https://example.com/images/johndoe.jpg",
//     "createdAt": "2024-07-09T12:00:00Z",
//     "updatedAt": "2024-07-09T12:00:00Z"
//   },
// ]

// const user1 = new User({
//   email: 'john.doe@example.com',
//   password: 'hashedpassword123',
//   googleId: 'google-12345',
//   name: 'John Doe',
//   profileImage: 'https://example.com/images/johndoe.jpg',
//   createdAt: new Date('2024-07-09T12:00:00Z'),
//   updatedAt: new Date('2024-07-09T12:00:00Z')
// });

// const user2 = new User({
//   email: 'jane.smith@example.com',
//   password: 'hashedpassword456',
//   googleId: null,
//   name: 'Jane Smith',
//   profileImage: 'https://example.com/images/janesmith.jpg',
//   createdAt: new Date('2024-07-09T12:05:00Z'),
//   updatedAt: new Date('2024-07-09T12:05:00Z')
// });




