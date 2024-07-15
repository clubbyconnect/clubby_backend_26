const multer = require('multer');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images are allowed.'), false);
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
  limits: { fileSize: 5 * 1024 * 1024 } 
});

module.exports = upload;



// const multer = require('multer');
// const os = require('os');

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, os.tmpdir());
//   },
//   filename: function (req, file, cb) {
//     cb(null, file.originalname);
//   }
// });

// const upload = multer({ storage: storage });

// module.exports = upload;


// const multer = require('multer');
// const path = require('path');
// const upload = multer({
//   storage: multer.diskStorage({
//     destination: function (req, file, callback) {
//       callback(null, 'src/uploads');
//     },
//     filename: function (req, file, callback) {
//       const uniqueFileName = `${file.fieldname}-${Date.now()}${path.extname(
//         file.originalname
//       )}`;
//       callback(null, uniqueFileName);
//     },
//   }),




//   fileFilter: (req, file, cb) => {
//     const allowedExtensions =
//       /\.(gif|jpe?g|tiff?|png|webp|bmp|pdf|docx?|xlsx?)$/i;

//     if (!file.originalname.match(allowedExtensions)) {
//       req.fileValidationError = 'Only JPG, PNG, PDF, DOC, or Excel allowed!';
//       return cb('Only .jpg, .png, .pdf, .doc, or .xlsx are allowed!', false);
//     } else if (file.size >= 10485760) {
//       req.fileValidationError = 'File size should be 10MB or less.';
//       return cb('File size should be 10MB or less.', false);
//     }
//     cb(null, true);
//   },
// });

// module.exports = upload;

//************************************************************************************************************************** */

// const multer = require('multer');
// const path = require('path');

// const storage = multer.diskStorage({

//     destination: function(req, file, cb)
//     {
//         cb(null,'./uploads/profile_img');
//     },
//     filename: function(req, file, cb)
//     {
//         cb(null, Math.floor(Math.random() * 899999 + 100000)+path.extname(file.originalname));
//     }

// });

// const upload = multer({
//     storage: storage,
//     fileFilter: function (req, file, cb) {
//         if(file.size>5*1024*1024)
//         {
//             console.log('---->>file');
//             cb(null,false);
//             return cb(new Error("file is to large"));
//         }
//         else if (
//             file.mimetype == "image/jpg" ||
//             file.mimetype == "image/png" ||
//             file.mimetype == "image/jpeg"
//         ){
//             return cb(null, true);
//         }
//         else
//         {
//             cb(null,false);
//             return cb(new Error("only .jpg,.jpeg,.png is allowed!"));
//         }
//     },
   
   
// });

// module.exports={upload}; 