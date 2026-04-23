function createRateLimiter(options = {}) {
  const {
    windowMs = 60_000,
    max = 60,
    keyGenerator = (req) => req.ip || 'unknown',
    message = 'Too many requests',
  } = options;

  const buckets = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('X-RateLimit-Reset', String(bucket.resetAt));

    if (bucket.count > max) {
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

module.exports = {
  createRateLimiter,
};
