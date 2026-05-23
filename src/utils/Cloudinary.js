const cloudinary = require("cloudinary").v2;
const fs = require("fs");

function formatCloudinaryConfigError(error) {
    const httpCode = error?.http_code ?? error?.error?.http_code;
    const message = error?.message ?? error?.error?.message ?? String(error);

    if (httpCode === 401 && /disabled api_key/i.test(message)) {
        return "Cloudinary API key is disabled. In Cloudinary Dashboard → Settings → Access Keys, create a new key pair and update CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET in .env (and Vercel env).";
    }
    if (/invalid api_key/i.test(message)) {
        return "Invalid Cloudinary API key. Copy API Key, API Secret, and Cloud name from Cloudinary Dashboard → Settings (must match cloud dlb8pmzph if using existing image URLs).";
    }
    if (/invalid signature/i.test(message)) {
        return "Invalid Cloudinary signature — API Secret does not match API Key. In Cloudinary Dashboard → Settings → Access Keys, copy the full API Secret (usually 27+ characters) into JJ_Backend/.env as CLOUDINARY_API_SECRET, then restart the backend.";
    }
    return message || "Cloudinary upload failed";
}

function getCloudinaryConfigError() {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const key = process.env.CLOUDINARY_API_KEY?.trim();
    const secret = process.env.CLOUDINARY_API_SECRET?.trim();

    if (!cloud || !key || !secret) {
        return "Cloudinary is not configured on the server (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in JJ_Backend/.env)";
    }
    if (secret.length < 20) {
        return `CLOUDINARY_API_SECRET looks too short (${secret.length} chars). Copy the full secret from Cloudinary Dashboard → Settings → Access Keys (not the API key).`;
    }
    return null;
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
});

const uploadOnCloudinary = async (localFilePath) => {
    if (!localFilePath) {
        return { error: "No file path provided" };
    }

    const configError = getCloudinaryConfigError();
    if (configError) {
        console.error("Cloudinary config:", configError);
        return { error: configError };
    }

    try {
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
            secure: true,
        });
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        return response;
    } catch (error) {
        const friendly = formatCloudinaryConfigError(error);
        console.error("Cloudinary upload failed:", friendly);
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        return { error: friendly };
    }
};

module.exports = uploadOnCloudinary;
module.exports.getCloudinaryConfigError = getCloudinaryConfigError;

