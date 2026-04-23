const crypto = require('crypto');

function isPrivateDevOrigin(origin) {
  if (typeof origin !== 'string') {
    return false;
  }

  return /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):3000$/i.test(origin);
}

function getAllowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    ...configured,
  ]);
}

function requireTrustedOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  if (!getAllowedOrigins().has(origin) && !(process.env.NODE_ENV !== 'production' && isPrivateDevOrigin(origin))) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  next();
}

function createRequestId() {
  return crypto.randomUUID();
}

function requestContext(req, res, next) {
  req.requestId = createRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = {
  getAllowedOrigins,
  isPrivateDevOrigin,
  requestContext,
  requireTrustedOrigin,
};
