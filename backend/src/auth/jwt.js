/**
 * JWT Authentication Module
 * Handles token creation, validation, and refresh
 */

const crypto = require('crypto');

// In production, use environment variables and proper key management (e.g., AWS KMS)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';   // 7 days

/**
 * Parse JWT without verification (for debugging only)
 */
function parseJWT(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Create a JWT token (simplified implementation for demo)
 * In production, use 'jsonwebtoken' library with RS256
 */
function createToken(payload, expirySeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const body = {
    ...payload,
    iat: now,
    exp: now + expirySeconds,
  };

  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
  const bodyEncoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const message = `${headerEncoded}.${bodyEncoded}`;
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(message)
    .digest('base64url');

  return `${message}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Invalid token format' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid token format' };
  }

  const [headerEncoded, bodyEncoded, signatureProvided] = parts;

  try {
    const message = `${headerEncoded}.${bodyEncoded}`;
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(message)
      .digest('base64url');

    if (signatureProvided !== expectedSignature) {
      return { ok: false, error: 'Invalid signature' };
    }

    const payload = JSON.parse(Buffer.from(bodyEncoded, 'base64url').toString('utf8'));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: 'Token expired' };
    }

    return { ok: true, payload };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Create access token (15 min)
 */
function createAccessToken(userId, email, username) {
  const expirySeconds = 15 * 60;  // 15 minutes
  return createToken(
    {
      sub: userId,
      email,
      username,
      type: 'access',
    },
    expirySeconds,
  );
}

/**
 * Create refresh token (7 days)
 */
function createRefreshToken(userId) {
  const expirySeconds = 7 * 24 * 60 * 60;  // 7 days
  return createToken(
    {
      sub: userId,
      type: 'refresh',
    },
    expirySeconds,
  );
}

/**
 * Extract token from Authorization header
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyToken,
  extractTokenFromHeader,
  parseJWT,
};
