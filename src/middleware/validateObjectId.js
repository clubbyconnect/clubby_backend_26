const { isValidObjectId } = require("../utils/validators");

/**
 * Route guard for a single ObjectId-shaped URL param.
 * Returns 400 with the offending value so the client knows exactly what was
 * rejected (helps the frontend trace bad call sites). Use as:
 *   router.get("/categories/:id", requireValidObjectId("id"), handler)
 */
const requireValidObjectId = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  if (!isValidObjectId(value)) {
    return res.status(400).json({
      success: false,
      message: `Invalid ${paramName}`,
      received: { [paramName]: value },
    });
  }
  next();
};

module.exports = { requireValidObjectId };
