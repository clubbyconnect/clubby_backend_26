const uploadOnCloudinary = require("../utils/Cloudinary.js");

const FileController = {
  image: async (req, res) => {
    try {
      // Check if a file was uploaded
      console.log("req", req)
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      // Upload image to Cloudinary
      const uploadedImage = await uploadOnCloudinary(req.file.path);

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

      return res.status(200).json({
        success: true,
        message: "Image uploaded successfully",
        imageUrl: uploadedImage.secure_url || uploadedImage.url,
      });

    } catch (error) {
      console.error("Error uploading image:", error);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
};

module.exports = FileController;
