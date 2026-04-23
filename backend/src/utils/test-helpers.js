/**
 * Testing Utilities
 * Helper functions for integration and unit tests
 */

const crypto = require('crypto');

/**
 * Generate test user data
 */
function generateTestUser(overrides = {}) {
  const id = crypto.randomUUID();
  return {
    email: `test${id.slice(0, 8)}@example.com`,
    username: `testuser${id.slice(0, 8)}`,
    password: 'TestPassword123!',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + id,
    ...overrides,
  };
}

/**
 * Generate test conversation data
 */
function generateTestConversation(overrides = {}) {
  return {
    type: 'direct',
    name: 'Test Conversation',
    description: 'A test conversation for unit tests',
    ...overrides,
  };
}

/**
 * Generate test message data
 */
function generateTestMessage(overrides = {}) {
  return {
    content: 'Hello, this is a test message!',
    type: 'text',
    metadata: {},
    ...overrides,
  };
}

/**
 * Generate valid JWT token for testing
 */
function generateTestToken(userId = 'test@example.com', expiresIn = '1h') {
  const crypto = require('crypto');

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    sub: userId,
    email: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiresIn === '1h' ? 3600 : 86400),
  };

  const secret = process.env.JWT_SECRET || 'test-secret-key';

  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const payloadEncoded = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * Create test file data
 */
function generateTestFile(overrides = {}) {
  return {
    filename: 'test-file.txt',
    mimetype: 'text/plain',
    size: 1024,
    buffer: Buffer.from('test file content'),
    ...overrides,
  };
}

/**
 * Assert HTTP response status
 */
function assertStatus(response, expectedStatus) {
  if (response.statusCode !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.statusCode}. ` +
      `Response: ${JSON.stringify(response.body)}`,
    );
  }
  return response;
}

/**
 * Assert response has expected fields
 */
function assertFields(obj, expectedFields) {
  const missing = [];

  for (const field of expectedFields) {
    if (!(field in obj)) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing fields: ${missing.join(', ')}`);
  }

  return obj;
}

/**
 * Create mock request object
 */
function createMockRequest(overrides = {}) {
  return {
    method: 'GET',
    path: '/',
    headers: {},
    body: {},
    params: {},
    query: {},
    user: null,
    ...overrides,
  };
}

/**
 * Create mock response object
 */
function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      this.body = data;
      return this;
    },
    send: function (data) {
      this.body = data;
      return this;
    },
    setHeader: function (key, value) {
      this.headers[key] = value;
      return this;
    },
    getHeader: function (key) {
      return this.headers[key];
    },
  };
  return response;
}

/**
 * Wait for condition with timeout
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Clean up test data
 */
function cleanupTestData() {
  // In a real test environment, this would delete test data from the database
  // For in-memory models, you might reset the data store
  console.log('Test data cleaned up');
}

/**
 * Hash password for testing
 */
function hashPasswordForTest(password) {
  const crypto = require('crypto');
  const iterations = 1000;  // Use fewer iterations for speed in tests
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');

  return {
    salt,
    hash,
    iterations,
    algorithm: 'pbkdf2',
  };
}

module.exports = {
  generateTestUser,
  generateTestConversation,
  generateTestMessage,
  generateTestToken,
  generateTestFile,
  assertStatus,
  assertFields,
  createMockRequest,
  createMockResponse,
  waitFor,
  cleanupTestData,
  hashPasswordForTest,
};
