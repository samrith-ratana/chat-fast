/**
 * Rate Limiting Middleware
 * Distributed rate limiting using in-memory store
 * In production, use Redis for cross-instance synchronization
 */

const rateLimitStore = new Map();

/**
 * Rate limiter configuration per endpoint
 */
const RATE_LIMITS = {
  '/api/auth/register': { max: 5, windowMs: 3600000 },      // 5 per hour
  '/api/auth/login': { max: 10, windowMs: 3600000 },        // 10 per hour
  '/api/auth/refresh': { max: 100, windowMs: 3600000 },     // 100 per hour
  '/api/users/search': { max: 30, windowMs: 60000 },        // 30 per minute
  '/api/conversations': { max: 100, windowMs: 60000 },      // 100 per minute
  '/api/files/upload': { max: 10, windowMs: 3600000 },      // 10 per hour
  'websocket:send_message': { max: 100, windowMs: 60000 },  // 100 per minute
  'websocket:sync': { max: 50, windowMs: 60000 },           // 50 per minute
};

/**
 * Get current request count and reset time
 */
function getOrCreateBucket(identifier, limit) {
  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, {
      count: 0,
      resetAt: Date.now() + limit.windowMs,
    });
  }

  const bucket = rateLimitStore.get(identifier);

  // Reset if window has passed
  if (Date.now() > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = Date.now() + limit.windowMs;
  }

  return bucket;
}

/**
 * Express middleware for rate limiting
 */
function createRateLimitMiddleware(endpoint) {
  return (req, res, next) => {
    const limit = RATE_LIMITS[endpoint];
    if (!limit) {
      return next();  // No limit defined
    }

    // Identify by IP or user
    const identifier = req.user?.sub || req.ip;
    const bucket = getOrCreateBucket(`${endpoint}:${identifier}`, limit);

    // Set response headers
    const remaining = Math.max(0, limit.max - bucket.count);
    const resetAt = bucket.resetAt;

    res.setHeader('X-RateLimit-Limit', limit.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (bucket.count >= limit.max) {
      return res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      });
    }

    bucket.count++;
    next();
  };
}

/**
 * WebSocket rate limiting (for send_message, etc)
 */
function checkWebSocketRateLimit(identifier, action) {
  const endpoint = `websocket:${action}`;
  const limit = RATE_LIMITS[endpoint];

  if (!limit) {
    return { ok: true };
  }

  const bucket = getOrCreateBucket(`${endpoint}:${identifier}`, limit);

  if (bucket.count >= limit.max) {
    return {
      ok: false,
      resetAt: bucket.resetAt,
      remaining: 0,
    };
  }

  bucket.count++;
  return {
    ok: true,
    remaining: Math.max(0, limit.max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Cleanup old buckets (memory management)
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt < now) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`✓ Rate limit cleanup: removed ${cleaned} expired buckets`);
  }
}, 300000);  // Every 5 minutes

module.exports = {
  createRateLimitMiddleware,
  checkWebSocketRateLimit,
  RATE_LIMITS,
};
