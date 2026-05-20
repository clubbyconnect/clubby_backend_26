#!/usr/bin/env node
/**
 * Run: node scripts/check-cloudinary-env.js
 * Validates CLOUDINARY_* in .env before testing image upload.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const key = process.env.CLOUDINARY_API_KEY?.trim();
const secret = process.env.CLOUDINARY_API_SECRET?.trim();

let ok = true;

if (!cloud || !key || !secret) {
  console.error("Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET in .env");
  ok = false;
}

if (secret && secret.length < 20) {
  console.error(
    `CLOUDINARY_API_SECRET is only ${secret.length} chars. Copy the full API Secret from the POS_Rest row (not cloud name "${cloud}").`,
  );
  ok = false;
}

if (secret && cloud && secret === cloud) {
  console.error("CLOUDINARY_API_SECRET must not be the same as CLOUDINARY_CLOUD_NAME.");
  ok = false;
}

if (key === "922554432292622") {
  console.error("CLOUDINARY_API_KEY is disabled (Untitled). Use active POS_Rest key 834773527897377.");
  ok = false;
}

if (!ok) {
  process.exit(1);
}

const cloudinary = require("cloudinary").v2;
cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret });

cloudinary.api
  .ping()
  .then(() => {
    console.log("Cloudinary OK — key/secret match cloud", cloud);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Cloudinary ping failed:", e?.error?.message || e?.message);
    process.exit(1);
  });
