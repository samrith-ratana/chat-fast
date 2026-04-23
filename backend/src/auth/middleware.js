/**
 * Authentication Middleware for Express
 * Validates JWT tokens and attaches user info to request
 */

const { verifyToken, extractTokenFromHeader } = require('./jwt');

/**
 * Middleware to verify JWT from Authorization header
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const result = verifyToken(token);
  if (!result.ok) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: result.error,
    });
  }

  if (result.payload.type !== 'access') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Access token required',
    });
  }

  // Attach user info to request
  req.user = result.payload;
  next();
}

/**
 * Optional auth middleware - doesn't fail if token missing
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (token) {
    const result = verifyToken(token);
    if (result.ok && result.payload.type === 'access') {
      req.user = result.payload;
    }
  }

  next();
}

/**
 * Validate user owns resource
 */
function requireOwnership(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const resourceUserId = req.params.userId || req.body.user_id;
  if (req.user.sub !== resourceUserId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not own this resource',
    });
  }

  next();
}

/**
 * Validate conversation membership
 * Note: In real implementation, check database
 */
function requireConversationMembership(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  // TODO: Check if req.user.sub is member of req.params.conversationId
  // For now, just verify they exist
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireOwnership,
  requireConversationMembership,
};
