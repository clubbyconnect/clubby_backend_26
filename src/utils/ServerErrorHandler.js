class ErrorHandler extends Error {
  constructor(message, statusCode, res) {
    super(message);
    this.statusCode = statusCode;
    res.status(statusCode).json({ message: message });
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

  console.error(error);
  const statusCode = error.statusCode || error.status || 500;
  const message =
    error.message ||
    (error.name === "TokenExpiredError"
      ? "Session expired. Please sign in again."
      : "Something went wrong. Please try again.");
  return new ErrorHandler(message, statusCode, res);
};

module.exports = serverErrorHandler;
