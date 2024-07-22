const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const validator = require("validator");


const userSchema = new Schema(
  {
    firstName: {
      type: String,
      trim: true,
      minlength: [2, "First name must be at least 2 characters long"],
      maxlength: [50, "First name cannot exceed 50 characters"],
      match: [/^[a-zA-Z\s]+$/, "First name can only contain letters and spaces"],
      default: null,
    },
    lastName: {
      type: String,
      trim: true,
      minlength: [2, "First name must be at least 2 characters long"],
      maxlength: [50, "First name cannot exceed 50 characters"],
      match: [/^[a-zA-Z\s]+$/, "First name can only contain letters and spaces"],
      default: null,
    },
    gender : {
      type: String,
      enum: {
        values: ['Male', 'Female', 'Other'],
        message: "Gender must be either 'Male', 'Female' or 'Other'",
      },
      default : null
    },
    homelocation : {
      type: String,
      trim: true,
      minlength: [3, "Location must be at least 3 characters long"],
      maxlength: [50, "Location cannot exceed 50 characters"],
      default : null
    },
    homelocationChangeCount: {
      type: Number,
      default: 0
    },
    lastHomelocationChange: {
      type: Date,
      default: null
    },
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
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailChangeCount: {
      type: Number,
      default: 0
    },
    lastEmailChange: {
      type: Date,
      default: null
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password should be at least 8 characters long"],
    },
    mobileNo: {
      type: String,
      match: [
        /^[6-9]\d{9}$/,
        "Please enter a valid 10 digits Indian mobile number",
      ],
      default : null
    },
    mobileNoVerified: {
      type: Boolean,
      default: false,
    },
    mobileNoChangeCount: {
      type: Number,
      default: 0
    },
    lastMobileNoChange: {
      type: Date,
      default: null
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ["Pending", "Verified", "Rejected"],
      default: "Pending",
    },
    googleAuthId: {
      type: String,
      trim: true,
      default : null
    },
    avatar: {
      type: String,
      default : "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381617/default%20images/lbzfg1b3wzyhru4j9vjw.png",
      match: [/^(http|https):\/\/[^ "]+$/, "Avatar must be a valid URL"],
    },
    UserRating: {
      type: Number,
      default : 0
    },
    bio: {
      type: String,
      minlength: [3, "Bio must be at least 3 characters long"],
      maxlength: [50, "Bio cannot exceed 50 characters"],
      default : null
    },
    SocialMediaLink: {
      type: String,
      trim: true,
      match: [/^(http|https):\/\/[^ "]+$/, "Social media link must be a valid URL"],
      default: null,
    },
    blockedUsers: [
      { 
        type: Schema.Types.ObjectId, ref: 'User'
       }
    ],
    reportCount: {
      type: Number,
      default : 0
    },
    postCount: {
      type: Number,
      default: 0,
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

//spam security Restrictions Functions
userSchema.pre('save', async function (next) {

  if (this.isNew) {
    return next();
  }
  const now = new Date();
  const minChangeInterval = 30 * 24 * 60 * 60 * 1000;

  if (this.isModified('email')) {
    if (this.lastEmailChange && now - this.lastEmailChange < minChangeInterval) {
      const err = new Error('You cannot change your email more than once in 30 days.');
      next(err);
    } else {
      this.emailChangeCount += 1;
      this.lastEmailChange = now;
    }
  }
  if (this.isModified('homelocation')) {
    if (this.lastHomelocationChange && now - this.lastHomelocationChange < minChangeInterval) {
      const err = new Error('You cannot change your homelocation more than once in 30 days.');
      next(err);
    } else {
      this.homelocationChangeCount += 1;
      this.lastHomelocationChange = now;
    }
  }
  if (this.isModified('mobileNo')) {
    if (this.lastMobileNoChange && now - this.lastMobileNoChange < minChangeInterval) {
      const err = new Error('You cannot change your mobileNo more than once in 30 days.');
      next(err);
    } else {
      this.mobileNoChangeCount += 1;
      this.lastMobileNoChange = now;
    }
  }
  next();
});

const User = mongoose.model("user", userSchema);
module.exports = User;





