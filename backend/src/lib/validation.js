const path = require('path');

function normalizeWhitespace(value) {
  return value.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function sanitizePlainText(value, options = {}) {
  const { maxLength = 4000, allowEmpty = false } = options;
  const raw = typeof value === 'string' ? value : '';
  const normalized = normalizeWhitespace(raw).replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  if (!allowEmpty && !normalized.length) {
    throw new Error('Text content is required');
  }

  if (normalized.length > maxLength) {
    throw new Error(`Text content exceeds ${maxLength} characters`);
  }

  return normalized;
}

function sanitizeIdentifier(value, fieldName, maxLength = 128) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw.length) {
    throw new Error(`${fieldName} is required`);
  }

  if (raw.length > maxLength) {
    throw new Error(`${fieldName} exceeds ${maxLength} characters`);
  }

  return raw.replace(/[^\w@.\-:]/g, '_');
}

function sanitizeEmail(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new Error('Invalid email');
  }
  return raw;
}

function sanitizeUsername(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(raw)) {
    throw new Error('Username must be 3-32 characters and use letters, numbers, ".", "_" or "-"');
  }
  return raw;
}

function sanitizeFilename(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const base = path.basename(raw).replace(/[^\w.\-() ]/g, '_');
  if (!base.length) {
    throw new Error('Filename is required');
  }
  return base.slice(0, 180);
}

function parseLimit(value, defaultLimit = 30, maxLimit = 100) {
  const parsed = Number.parseInt(String(value ?? defaultLimit), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultLimit;
  }
  return Math.min(parsed, maxLimit);
}

function parseSequenceCursor(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid cursor');
  }
  return parsed;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function inferPreviewKind(mimeType) {
  if (typeof mimeType !== 'string') {
    return 'binary';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  ) {
    return 'text';
  }

  return 'binary';
}

module.exports = {
  ensureArray,
  inferPreviewKind,
  parseLimit,
  parseSequenceCursor,
  sanitizeEmail,
  sanitizeFilename,
  sanitizeIdentifier,
  sanitizePlainText,
  sanitizeUsername,
};
