/**
 * One-time migration: profile verification fields on User collection.
 *
 * Rules:
 *  - No phoneNumber → phoneNumberVerified = false
 *  - otpSkipped without phone → phoneNumberVerified = false, unset otpSkipped
 *  - Google/Apple + email → signupMethod = "email", emailVerified = true
 *  - Missing/wrong signupMethod on social users → "email"
 *
 * Usage:
 *   node scripts/migrate-profile-verification.js           # dry-run (default)
 *   node scripts/migrate-profile-verification.js --apply   # write changes
 */

require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
const User = require("../src/models/User.js");

const APPLY = process.argv.includes("--apply");

const noPhoneFilter = {
  $or: [
    { phoneNumber: null },
    { phoneNumber: { $exists: false } },
  ],
};

async function countUsers(filter) {
  return User.countDocuments(filter);
}

async function runRule(label, filter, update, useCollection = false) {
  const matched = useCollection
    ? await User.collection.countDocuments(filter)
    : await countUsers(filter);

  console.log(`\n${label}`);
  console.log(`  matched: ${matched}`);

  if (!APPLY || matched === 0) {
    console.log(`  action: ${APPLY ? "skip (0 matches)" : "dry-run only"}`);
    return { matched, modified: 0 };
  }

  const result = useCollection
    ? await User.collection.updateMany(filter, update)
    : await User.updateMany(filter, update);

  console.log(`  modified: ${result.modifiedCount ?? 0}`);
  return { matched, modified: result.modifiedCount ?? 0 };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }

  console.log(APPLY ? "=== APPLY MODE ===" : "=== DRY RUN (pass --apply to write) ===");

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const summary = [];

  summary.push(
    await runRule(
      "1. Force phoneNumberVerified=false when no phoneNumber",
      { phoneNumberVerified: true, ...noPhoneFilter },
      { $set: { phoneNumberVerified: false } },
    ),
  );

  summary.push(
    await runRule(
      "2. otpSkipped without phone → not verified, remove otpSkipped",
      { otpSkipped: true, ...noPhoneFilter },
      { $set: { phoneNumberVerified: false }, $unset: { otpSkipped: "" } },
      true,
    ),
  );

  summary.push(
    await runRule(
      "3. otpSkipped with phone but unverified → remove otpSkipped only (no auto-verify)",
      {
        otpSkipped: true,
        phoneNumber: { $nin: [null] },
        phoneNumberVerified: { $ne: true },
      },
      { $unset: { otpSkipped: "" } },
      true,
    ),
  );

  summary.push(
    await runRule(
      "4. Google/Apple users with email → signupMethod=email, emailVerified=true",
      {
        email: { $nin: [null, ""] },
        $or: [
          { googleAuthId: { $nin: [null, ""] } },
          { appleAuthId: { $nin: [null, ""] } },
        ],
      },
      { $set: { signupMethod: "email", emailVerified: true } },
    ),
  );

  summary.push(
    await runRule(
      "5. Missing signupMethod → default email",
      {
        $or: [
          { signupMethod: null },
          { signupMethod: { $exists: false } },
          { signupMethod: { $nin: ["email", "phone"] } },
        ],
      },
      { $set: { signupMethod: "email" } },
    ),
  );

  summary.push(
    await runRule(
      "6. Phone-primary users (signupMethod=phone) keep phone; ensure no false verified without phone",
      { signupMethod: "phone", ...noPhoneFilter },
      { $set: { phoneNumberVerified: false } },
    ),
  );

  summary.push(
    await runRule(
      "7. OTP-only save: remove unverified phone on email-signup users (old UpdateUserDetails flow)",
      {
        signupMethod: { $ne: "phone" },
        phoneNumberVerified: { $ne: true },
        phoneNumber: { $nin: [null] },
      },
      { $unset: { phoneNumber: "" }, $set: { phoneNumberVerified: false } },
    ),
  );

  const totalModified = summary.reduce((n, r) => n + r.modified, 0);
  console.log("\n=== Summary ===");
  console.log(`  rules run: ${summary.length}`);
  console.log(`  total modified: ${totalModified}`);
  console.log(APPLY ? "  done." : "  re-run with --apply to persist.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
