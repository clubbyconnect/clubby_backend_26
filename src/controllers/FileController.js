const uploadOnCloudinary = require("../utils/Cloudinary.js");
const uploadBufferOnCloudinary = require("../utils/Cloudinary.js").uploadBufferOnCloudinary;
const getCloudinaryConfigError = require("../utils/Cloudinary.js").getCloudinaryConfigError;

const FileController = {
  image: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const configError = getCloudinaryConfigError();
      if (configError) {
        return res.status(503).json({ success: false, error: configError });
      }

      const uploadedImage = req.file.buffer
        ? await uploadBufferOnCloudinary(
            req.file.buffer,
            req.file.mimetype || "image/jpeg",
          )
        : await uploadOnCloudinary(req.file.path);

      if (uploadedImage?.error) {
        return res.status(500).json({
          success: false,
          error: uploadedImage.error,
        });
      }

      if (!uploadedImage?.secure_url && !uploadedImage?.url) {
        return res.status(500).json({
          success: false,
          error: "Image upload failed (no URL from Cloudinary)",
        });
      }

      const imageUrl = uploadedImage.secure_url || uploadedImage.url;
      return res.status(200).json({
        success: true,
        message: "Image uploaded successfully",
        imageUrl,
        url: imageUrl,
        data: { imageUrl },
      });

    } catch (error) {
      console.error("Error uploading image:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
};

module.exports = FileController;
