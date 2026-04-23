/**
 * CORS and Security Configuration
 * Configures cross-origin requests and security headers
 */

/**
 * CORS configuration
 */
function getCORSConfig() {
  const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3001,http://localhost:3000').split(
    ',',
  );

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS denied for origin: ${origin}`);
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400,  // 24 hours
  };
}

/**
 * Security headers middleware
 */
function securityHeadersMiddleware(req, res, next) {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy (strict)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss:",
  );

  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
}

/**
 * Request logging middleware
 */
function requestLoggingMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    console.log(`[${logLevel.toUpperCase()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);

    if (res.statusCode >= 500) {
      console.error(`Server error at ${req.path}:`, res.statusCode);
    }
  });

  next();
}

/**
 * Error handling middleware
 */
function errorHandlingMiddleware(err, req, res, next) {
  console.error('Unhandled error:', err);

  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? err.message : undefined,
    ...(isDevelopment && { stack: err.stack }),
  });
}

module.exports = {
  getCORSConfig,
  securityHeadersMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
};
