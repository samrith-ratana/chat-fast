/**
 * Typing Indicator Service
 * Tracks and broadcasts typing status in conversations
 */

// Track active typists per conversation
const typingIndicators = new Map();  // conversationId -> { userId: { typingAt, username } }

const TYPING_TIMEOUT = 3000;  // 3 seconds

/**
 * Set user as typing in conversation
 */
function setTyping(conversationId, userId, username) {
  if (!typingIndicators.has(conversationId)) {
    typingIndicators.set(conversationId, {});
  }

  const typists = typingIndicators.get(conversationId);

  // Clear existing timeout for this user
  if (typists[userId]?.timeout) {
    clearTimeout(typists[userId].timeout);
  }

  // Set typing status with auto-clear timeout
  typists[userId] = {
    userId,
    username,
    typingAt: Date.now(),
    timeout: setTimeout(() => {
      clearTyping(conversationId, userId);
    }, TYPING_TIMEOUT),
  };

  return {
    conversationId,
    typists: getTypists(conversationId),
  };
}

/**
 * Clear user typing status
 */
function clearTyping(conversationId, userId) {
  const typists = typingIndicators.get(conversationId);

  if (typists && typists[userId]) {
    if (typists[userId].timeout) {
      clearTimeout(typists[userId].timeout);
    }
    delete typists[userId];
  }

  return {
    conversationId,
    typists: getTypists(conversationId),
  };
}

/**
 * Get all users typing in conversation
 */
function getTypists(conversationId) {
  const typists = typingIndicators.get(conversationId) || {};
  const now = Date.now();

  // Filter out timed-out typists
  const active = [];
  for (const [userId, typist] of Object.entries(typists)) {
    if (now - typist.typingAt < TYPING_TIMEOUT) {
      active.push({
        userId: typist.userId,
        username: typist.username,
      });
    }
  }

  return active;
}

/**
 * Clear all typists for conversation
 */
function clearConversationTypists(conversationId) {
  const typists = typingIndicators.get(conversationId) || {};

  for (const typist of Object.values(typists)) {
    if (typist.timeout) {
      clearTimeout(typist.timeout);
    }
  }

  typingIndicators.delete(conversationId);
}

/**
 * Get typing status summary for multiple conversations
 */
function getTypingSummary(conversationIds) {
  const summary = {};

  for (const convId of conversationIds) {
    const typists = getTypists(convId);
    if (typists.length > 0) {
      summary[convId] = typists;
    }
  }

  return summary;
}

module.exports = {
  setTyping,
  clearTyping,
  getTypists,
  clearConversationTypists,
  getTypingSummary,
  TYPING_TIMEOUT,
};
