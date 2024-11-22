const multer = require('multer');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueSuffix);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Set a higher limit for video files if necessary
  fileFilter: (req, file, cb) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'];
    const audioTypes = ['audio/mpeg', 'audio/mp3'];
    const videoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']; // Common video MIME types

    if (file.fieldname === 'image' && imageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else if (file.fieldname === 'audio' && audioTypes.includes(file.mimetype)) {
      cb(null, true);
    } else if (file.fieldname === 'video' && videoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type.'));
    }
  }
});

module.exports = { upload };
