class ErrorHandler extends Error {
    constructor(message, statusCode, res) {
      super(message);
      this.statusCode = statusCode;
      res.status(statusCode).json({message: message});
      Error.captureStackTrace(this, this.constructor);
    }
  }
  module.exports = ErrorHandler;
  