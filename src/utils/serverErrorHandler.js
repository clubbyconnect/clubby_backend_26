class ErrorHandler extends Error {
  constructor(message, statusCode, res) {
    super(message);
    this.statusCode = statusCode;
    res.status(statusCode).json({message: message});
    Error.captureStackTrace(this, this.constructor);
  }
}

const serverErrorHandler = (error, res) => {

  if (error.name === 'ValidationError') {
    const errors = Object.keys(error.errors).map(key => ({
      message: error.errors[key].message
    }));
    return new ErrorHandler(`${errors[0].message}`, 400, res);
  }
  console.log(error);
  return new ErrorHandler("Server error. Something went wrong", 500, res);
};

module.exports = serverErrorHandler;


