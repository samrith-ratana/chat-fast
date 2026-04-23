/**
 * Comprehensive Error Handling Middleware
 * Standardized error responses and logging
 */

class APIError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

// Common error factory functions
const Errors = {
  BadRequest: (message, code = 'BAD_REQUEST') =>
    new APIError(message, 400, code),

  Unauthorized: (message, code = 'UNAUTHORIZED') =>
    new APIError(message, 401, code),

  Forbidden: (message, code = 'FORBIDDEN') =>
    new APIError(message, 403, code),

  NotFound: (message, code = 'NOT_FOUND') =>
    new APIError(message, 404, code),

  Conflict: (message, code = 'CONFLICT') =>
    new APIError(message, 409, code),

  TooManyRequests: (message, code = 'RATE_LIMIT_EXCEEDED') =>
    new APIError(message, 429, code),

  InternalError: (message, code = 'INTERNAL_ERROR') =>
    new APIError(message, 500, code),

  ValidationError: (message) =>
    new APIError(message, 400, 'VALIDATION_ERROR'),

  AuthenticationFailed: () =>
    new APIError('Authentication failed', 401, 'AUTHENTICATION_FAILED'),

  TokenExpired: () =>
    new APIError('Token expired', 401, 'TOKEN_EXPIRED'),

  InvalidToken: () =>
    new APIError('Invalid token', 401, 'INVALID_TOKEN'),

  UserNotFound: () =>
    new APIError('User not found', 404, 'USER_NOT_FOUND'),

  ConversationNotFound: () =>
    new APIError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND'),

  FileNotFound: () =>
    new APIError('File not found', 404, 'FILE_NOT_FOUND'),

  DuplicateEmail: () =>
    new APIError('Email already registered', 409, 'DUPLICATE_EMAIL'),

  DuplicateUsername: () =>
    new APIError('Username already taken', 409, 'DUPLICATE_USERNAME'),

  InvalidEmail: () =>
    new APIError('Invalid email format', 400, 'INVALID_EMAIL'),

  InvalidPassword: () =>
    new APIError('Invalid email or password', 401, 'INVALID_CREDENTIALS'),

  WeakPassword: (errors) =>
    new APIError(`Password does not meet requirements: ${errors.join(', ')}`, 400, 'WEAK_PASSWORD'),

  PermissionDenied: () =>
    new APIError('You do not have permission to access this resource', 403, 'PERMISSION_DENIED'),

  MemberNotInConversation: () =>
    new APIError('User is not a member of this conversation', 403, 'NOT_MEMBER'),

  FileTooLarge: () =>
    new APIError('File exceeds maximum size limit (500MB)', 413, 'FILE_TOO_LARGE'),

  InvalidFileType: () =>
    new APIError('File type not allowed', 400, 'INVALID_FILE_TYPE'),

  ConversationAlreadyExists: () =>
    new APIError('Direct conversation with this user already exists', 409, 'DUPLICATE_CONVERSATION'),
};

/**
 * Global error handling middleware
 */
function errorHandler(err, req, res, next) {
  // Ensure we have an APIError
  if (!(err instanceof APIError)) {
    console.error('Unhandled error:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    err = new APIError('Internal Server Error', 500, 'INTERNAL_ERROR');
  } else {
    // Log API errors for debugging
    console.warn(`[${err.code}] ${err.message} - ${req.method} ${req.path}`);
  }

  // Build error response
  const response = {
    error: {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      timestamp: err.timestamp,
    },
  };

  // Include request path for debugging
  if (process.env.NODE_ENV === 'development') {
    response.error.path = req.path;
    response.error.method = req.method;
  }

  // Include stack trace in development only
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.error.stack = err.stack.split('\n');
  }

  res.status(err.statusCode).json(response);
}

/**
 * Wrap async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation result helper
 */
function handleValidationError(result) {
  if (!result.valid) {
    throw Errors.ValidationError(result.error);
  }
}

module.exports = {
  APIError,
  Errors,
  errorHandler,
  asyncHandler,
  handleValidationError,
};
