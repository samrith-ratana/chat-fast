const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

function validatePasswordStrength(password) {
  const errors = [];

  if (!password || password.length === 0) {
    errors.push('Password is required');
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (password.length > 256) {
    errors.push('Password is too long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function hashPassword(password) {
  const result = validatePasswordStrength(password);
  if (!result.valid) {
    throw new Error(result.errors[0]);
  }

  return {
    algorithm: 'bcrypt',
    hash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
    rounds: BCRYPT_ROUNDS,
  };
}

function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword || typeof storedPassword !== 'object') {
    return false;
  }

  if (storedPassword.algorithm !== 'bcrypt' || typeof storedPassword.hash !== 'string') {
    return false;
  }

  try {
    return bcrypt.compareSync(password, storedPassword.hash);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
};
