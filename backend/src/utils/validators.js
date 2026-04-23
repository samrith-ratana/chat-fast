/**
 * Input Validation & Sanitization Utilities
 * Protects against injection attacks, XSS, and invalid data
 */

/**
 * Validate email format
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' };
  }

  // RFC 5322 simplified regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (email.length > 254) {
    return { valid: false, error: 'Email too long (max 254 characters)' };
  }

  return { valid: true };
}

/**
 * Validate username
 */
function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username must be a string' };
  }

  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }

  if (username.length > 50) {
    return { valid: false, error: 'Username must be max 50 characters' };
  }

  // Allow alphanumeric, underscore, hyphen, dot
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, dots, hyphens, and underscores' };
  }

  return { valid: true };
}

/**
 * Validate message content
 */
function validateMessageContent(content) {
  if (content === undefined || content === null) {
    return { valid: false, error: 'Content is required' };
  }

  if (typeof content !== 'string') {
    return { valid: false, error: 'Content must be a string' };
  }

  if (content.trim().length === 0) {
    return { valid: false, error: 'Content cannot be empty' };
  }

  if (content.length > 65536) {
    return { valid: false, error: 'Content too long (max 65,536 characters)' };
  }

  return { valid: true };
}

/**
 * Validate UUID format
 */
function validateUUID(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'ID must be a string' };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return { valid: false, error: 'Invalid UUID format' };
  }

  return { valid: true };
}

/**
 * Validate SHA-256 hash
 */
function validateHash(hash) {
  if (!hash || typeof hash !== 'string') {
    return { valid: false, error: 'Hash must be a string' };
  }

  // SHA-256 produces 64 hex characters
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { valid: false, error: 'Invalid hash format' };
  }

  return { valid: true };
}

/**
 * Validate conversation ID (UUID or special format)
 */
function validateConversationId(conversationId) {
  if (!conversationId || typeof conversationId !== 'string') {
    return { valid: false, error: 'Conversation ID is required' };
  }

  // Allow 'conv-main' (demo) or UUID
  const isValid = conversationId === 'conv-main' || /^[0-9a-f-]{36}$/i.test(conversationId);

  if (!isValid) {
    return { valid: false, error: 'Invalid conversation ID format' };
  }

  return { valid: true };
}

/**
 * Sanitize HTML to prevent XSS
 */
function sanitizeHTML(text) {
  if (typeof text !== 'string') return '';

  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Validate and sanitize user input
 */
function sanitizeUserInput(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Validate file upload
 */
function validateFileUpload(file) {
  if (!file) {
    return { valid: false, error: 'File is required' };
  }

  const MAX_FILE_SIZE = 500 * 1024 * 1024;  // 500MB
  const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds 500MB limit' };
  }

  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return { valid: false, error: 'File type not allowed' };
  }

  if (!file.filename || file.filename.length === 0) {
    return { valid: false, error: 'Filename is required' };
  }

  if (file.filename.length > 255) {
    return { valid: false, error: 'Filename too long' };
  }

  return { valid: true };
}

/**
 * Validate conversation type
 */
function validateConversationType(type) {
  const validTypes = ['direct', 'group'];
  return validTypes.includes(type);
}

/**
 * Validate user role
 */
function validateUserRole(role) {
  const validRoles = ['owner', 'admin', 'member'];
  return validRoles.includes(role);
}

module.exports = {
  validateEmail,
  validateUsername,
  validateMessageContent,
  validateUUID,
  validateHash,
  validateConversationId,
  sanitizeHTML,
  sanitizeUserInput,
  validateFileUpload,
  validateConversationType,
  validateUserRole,
};
