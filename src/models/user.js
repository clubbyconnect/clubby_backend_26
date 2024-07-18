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
      required: [true, "Password is required"],
      minlength: [8, "Password should be at least 8 characters long"],
    },
    googleAuthId: {
      type: String,
      default : null
    },
    firstName: {
      type: String,
      trim: true,
      minlength: [2, "First name must be at least 2 characters long"],
      maxlength: [50, "First name cannot exceed 50 characters"],
      match: [/^[a-zA-Z\s]+$/, "First name can only contain letters and spaces"],
      default: null,

      default : null
    },
    lastname: {
      type: String,
      trim: true,
      minlength: [2, "First name must be at least 2 characters long"],
      maxlength: [50, "First name cannot exceed 50 characters"],
      match: [/^[a-zA-Z\s]+$/, "First name can only contain letters and spaces"],
      default: null,

      default : null
    },
    gender : {
      type: String,
      enum: {
        values: ['Male', 'Female', 'Other'],
        message: "Gender must be either 'Male', 'Female' or 'Other'",
      },
      default : null
    },
    MobileNo: {
      type: String,
      match: [
        /^[6-9]\d{9}$/,
        "Please enter a valid 10 digits Indian mobile number",
      ],
      default : null
    },
    location : {
      type: String,
      trim: true,
      maxlength: [100, "Location cannot exceed 100 characters"],
      default : null
    },
    avatar: {
      type: String,
      default : "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721114085/fk9iazynubn9toe8yrrq.png",
      match: [/^(http|https):\/\/[^ "]+$/, "Avatar must be a valid URL"],
    },
    isVerified: {
      type: String,
      default : false
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


