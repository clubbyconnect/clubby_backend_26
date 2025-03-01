const multer = require('multer');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Image types
    'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff',
    // Video types
    'video/mp4', 'video/mov', 'video/avi', 'video/mkv', 'video/webm',
    // Audio types
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and audio files are allowed.'), false);
  }
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, os.tmpdir());
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueSuffix);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // Increased limit to 50MB for videos and audio
});

module.exports = upload;
