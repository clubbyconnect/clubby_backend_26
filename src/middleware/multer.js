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

  const mime = file.mimetype || '';
  const isOctetImage =
    mime === 'application/octet-stream' &&
    /\.(jpe?g|png|gif|webp|heic)$/i.test(file.originalname || '');

  if (allowedTypes.includes(mime) || isOctetImage || mime === '') {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type (${mime}). Only images, videos, and audio files are allowed.`,
      ),
      false,
    );
  }
};

/** Vercel serverless: memory storage is more reliable than disk for multipart uploads. */
const storage = process.env.VERCEL
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, os.tmpdir());
      },
      filename: function (req, file, cb) {
        const ext = path.extname(file.originalname || '') || '.jpg';
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        cb(null, uniqueSuffix);
      },
    });

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = upload;
