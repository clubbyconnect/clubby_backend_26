const axios = require("axios");
const otpGenerator = require("otp-generator");
const serverErrorHandler = require("../utils/ServerErrorHandler.js");
const User = require("../models/User.js");
const AccountDeleteOtp = require("../models/AccountDeleteOtp.js");
const { toUserInfo } = require("../utils/userInfo.js");
const {
  DELETE_ACCOUNT_REASONS,
  DELETION_GRACE_MS,
  isDeletionGraceExpired,
  pickDeleteOtpContact,
} = require("../utils/accountDeletion.js");

const isDeactivatedByAdmin = (user) =>
  Boolean(user?.deletedAt && user?.deactivatedByAdminId);

const RESEND_COOLDOWN_MS = 30 * 1000;

const generateOtp = () =>
  otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });

const sendSms = async (phoneNumber, otp) => {
  const fast2SMSurl = process.env.FAST2SMS_URL;
  const fast2SMSapiKey = process.env.FAST2SMS_API_KEY;

  const response = await axios.get(fast2SMSurl, {
    params: {
      authorization: fast2SMSapiKey,
      route: "otp",
      variables_values: otp,
      numbers: phoneNumber,
      flash: "0",
    },
  });
  console.log("Fast2SMS delete-account OTP response:", response.data);
};

exports.requestDeleteOtp = async (req, res) => {
  try {
    const user = req.User;
    const { reason } = req.body;

    if (isDeactivatedByAdmin(user)) {
      return res.status(403).json({
        error: "Your account has been deactivated by an admin.",
      });
    }

    if (user.accountStatus === "pending_deletion") {
      return res.status(400).json({
        error: "Account deletion is already scheduled.",
      });
    }

    if (!reason || !DELETE_ACCOUNT_REASONS.includes(reason)) {
      return res.status(400).json({ error: "A valid deletion reason is required" });
    }

    const contact = pickDeleteOtpContact(user);
    if (!contact) {
      return res.status(400).json({
        error: "No registered email or phone number found for this account.",
      });
    }

    const existingOtp = await AccountDeleteOtp.findOne({ userId: user._id });
    if (existingOtp) {
      const ageMs = Date.now() - new Date(existingOtp.createdAt).getTime();
      if (ageMs < RESEND_COOLDOWN_MS) {
        return res.status(400).json({
          error: "OTP already sent pls try after some time",
        });
      }
      await AccountDeleteOtp.deleteOne({ _id: existingOtp._id });
    }

    const otp = generateOtp();
    const otpPayload = {
      userId: user._id,
      otp,
      deleteReason: reason,
    };

    if (contact.channel === "email") {
      otpPayload.email = contact.email;
    } else {
      otpPayload.phoneNumber = contact.phoneNumber;
    }

    try {
      await AccountDeleteOtp.create(otpPayload);
    } catch (deliveryError) {
      if (contact.channel === "email") {
        console.error(
          "requestDeleteOtp email delivery failed:",
          deliveryError?.message || deliveryError
        );
        return res.status(500).json({
          error:
            "Unable to send verification email. Configure MAIL_HOST, MAIL_USER, and MAIL_PASS in .env (use a Gmail App Password).",
        });
      }
      throw deliveryError;
    }

    if (contact.channel === "sms") {
      try {
        await sendSms(contact.phoneNumber, otp);
      } catch (smsError) {
        await AccountDeleteOtp.deleteOne({ userId: user._id });
        console.error("requestDeleteOtp SMS failed:", smsError?.message || smsError);
        return res.status(500).json({
          error: "Unable to send verification SMS. Check FAST2SMS_URL and FAST2SMS_API_KEY.",
        });
      }
    }

    return res.status(200).json({ success: true, message: "OTP sent" });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.confirmDelete = async (req, res) => {
  try {
    const user = req.User;
    const { otp } = req.body;

    if (!otp || String(otp).trim() === "") {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    if (isDeactivatedByAdmin(user)) {
      return res.status(403).json({
        error: "Your account has been deactivated by an admin.",
      });
    }

    if (user.accountStatus === "pending_deletion") {
      return res.status(400).json({
        error: "Account deletion is already scheduled.",
      });
    }

    const otpRecord = await AccountDeleteOtp.findOne({
      userId: user._id,
      otp: String(otp).trim(),
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const now = new Date();
    user.accountStatus = "pending_deletion";
    user.deletionRequestedAt = now;
    user.deletionScheduledAt = new Date(now.getTime() + DELETION_GRACE_MS);
    user.deleteReason = otpRecord.deleteReason;
    user.refreshToken = null;
    user.fcmToken = null;
    user.deviceType = null;
    await user.save({ validateBeforeSave: false });

    await AccountDeleteOtp.deleteOne({ _id: otpRecord._id });

    return res.status(200).json({ success: true });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};

exports.recoverAccount = async (req, res) => {
  try {
    const user = req.User;

    if (user.accountStatus !== "pending_deletion") {
      return res.status(400).json({
        error: "Account is not scheduled for deletion.",
      });
    }

    if (isDeletionGraceExpired(user)) {
      return res.status(403).json({
        error: "Your account deletion grace period has expired.",
      });
    }

    user.accountStatus = "active";
    user.deletionRequestedAt = null;
    user.deletionScheduledAt = null;
    user.deleteReason = null;
    await user.save({ validateBeforeSave: false });

    const updatedUser = await User.findById(user._id).select("-password -refreshToken");

    return res.status(200).json({
      success: true,
      message: "Account recovered",
      data: { userInfo: toUserInfo(updatedUser) },
    });
  } catch (error) {
    serverErrorHandler(error, res);
  }
};
