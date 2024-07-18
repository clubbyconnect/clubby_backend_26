
const ErrorHandler = require('../utils/ErrorHandler.js'); 

const handleValidationError = (error, res) => {

  if (error.name === 'ValidationError') {
    const errors = Object.keys(error.errors).map(key => ({
      message: error.errors[key].message
    }));
    return new ErrorHandler(`${errors[0].message}`, 400, res);
  }
  return new ErrorHandler(`${error.message}`, 500, res);
};

module.exports = handleValidationError;



// class ErrorHandler extends Error {
//     constructor(message, statusCode, res) {
//       super(message);
//       this.statusCode = statusCode;
//       res.status(statusCode).json({message: message});
//       Error.captureStackTrace(this, this.constructor);
//     }
//   }
//   module.exports = ErrorHandler;