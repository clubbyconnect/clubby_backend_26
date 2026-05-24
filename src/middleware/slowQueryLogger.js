const SLOW_MS = 500;

const SLOW_ENDPOINTS = new Set([
  "/searchproducts",
  "/homebootstrap",
  "/mygroups",
  "/fetchallcategory",
  "/categories",
]);

function slowQueryLogger(req, res, next) {
  const path = req.path.toLowerCase();
  const shouldLog = SLOW_ENDPOINTS.has(path.replace(/^\//, ""));

  if (!shouldLog) return next();

  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    if (durationMs >= SLOW_MS) {
      console.warn(
        `[slow-query] ${req.method} ${req.originalUrl} ${durationMs}ms status=${res.statusCode}`,
      );
    }
  });

  next();
}

module.exports = slowQueryLogger;
