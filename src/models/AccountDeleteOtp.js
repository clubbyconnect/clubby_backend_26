const mongoose = require("mongoose");
const mailSender = require("../utils/MailSender.js");

const AccountDeleteOtpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  otp: {
    type: String,
    required: true,
  },
  deleteReason: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    trim: true,
  },
  phoneNumber: {
    type: String,
    match: [/^[6-9]\d{9}$/, "Please enter a valid 10 digits Indian phoneNumber"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 10,
  },
});

AccountDeleteOtpSchema.pre("save", async function (next) {
  if (!this.isNew || this.phoneNumber) {
    return next();
  }
  if (!this.email) {
    return next();
  }
  try {
    await mailSender(
      this.email,
      "Confirm account deletion",
      `<h1>Account deletion verification</h1>
       <p>Your verification code is: <strong>${this.otp}</strong></p>
       <p>This code expires in 10 minutes.</p>`
    );
    next();
  } catch (error) {
    next(error);
  }
});

const AccountDeleteOtp = mongoose.model("AccountDeleteOtp", AccountDeleteOtpSchema);

module.exports = AccountDeleteOtp;
