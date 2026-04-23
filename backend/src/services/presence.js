/**
 * Presence Service
 * Tracks online status, last seen, and user activity
 */

// Track active user sessions
const activeSessions = new Map();  // userId -> { sessionId, connectedAt, lastActivityAt, status, deviceInfo }
const sessionConnections = new Map();  // sessionId -> userId

/**
 * Create new session for user
 */
function createSession(userId, sessionId, deviceInfo = {}) {
  const session = {
    userId,
    sessionId,
    connectedAt: Date.now(),
    lastActivityAt: Date.now(),
    status: 'online',
    deviceInfo: {
      userAgent: deviceInfo.userAgent || 'unknown',
      platform: deviceInfo.platform || 'web',
      ...deviceInfo,
    },
  };

  // Store user -> session mapping
  if (!activeSessions.has(userId)) {
    activeSessions.set(userId, []);
  }
  activeSessions.get(userId).push(session);

  // Store session -> userId mapping
  sessionConnections.set(sessionId, userId);

  return {
    status: 'online',
    sessionId,
    connectedAt: session.connectedAt,
  };
}

/**
 * End user session
 */
function endSession(sessionId) {
  const userId = sessionConnections.get(sessionId);

  if (!userId) return null;

  const userSessions = activeSessions.get(userId) || [];
  const sessionIndex = userSessions.findIndex((s) => s.sessionId === sessionId);

  if (sessionIndex > -1) {
    userSessions.splice(sessionIndex, 1);
  }

  if (userSessions.length === 0) {
    activeSessions.delete(userId);
  }

  sessionConnections.delete(sessionId);

  return {
    userId,
    status: userSessions.length > 0 ? 'online' : 'offline',
    lastSeenAt: Date.now(),
  };
}

/**
 * Update last activity for session
 */
function updateActivity(sessionId) {
  const userId = sessionConnections.get(sessionId);

  if (!userId) return null;

  const userSessions = activeSessions.get(userId) || [];
  const session = userSessions.find((s) => s.sessionId === sessionId);

  if (session) {
    session.lastActivityAt = Date.now();
  }

  return {
    userId,
    status: 'online',
    lastActivityAt: Date.now(),
  };
}

/**
 * Update user status (online/away/dnd/offline)
 */
function setUserStatus(userId, status, statusMessage = '') {
  const userSessions = activeSessions.get(userId) || [];

  if (userSessions.length === 0) {
    return { userId, status: 'offline' };
  }

  for (const session of userSessions) {
    session.status = status;
    session.statusMessage = statusMessage;
    session.statusUpdatedAt = Date.now();
  }

  return {
    userId,
    status,
    statusMessage,
    statusUpdatedAt: Date.now(),
  };
}

/**
 * Get user presence status
 */
function getUserPresence(userId) {
  const userSessions = activeSessions.get(userId) || [];

  if (userSessions.length === 0) {
    return {
      userId,
      status: 'offline',
      lastSeenAt: null,
      sessionCount: 0,
    };
  }

  // Get most recent activity across all sessions
  const lastActive = Math.max(...userSessions.map((s) => s.lastActivityAt));
  const status = userSessions[0].status || 'online';

  return {
    userId,
    status,
    statusMessage: userSessions[0].statusMessage || '',
    connectedAt: Math.min(...userSessions.map((s) => s.connectedAt)),
    lastActivityAt: lastActive,
    sessionCount: userSessions.length,
    devices: userSessions.map((s) => s.deviceInfo),
  };
}

/**
 * Get presence for multiple users
 */
function getMultiplePresence(userIds) {
  const presence = {};

  for (const userId of userIds) {
    presence[userId] = getUserPresence(userId);
  }

  return presence;
}

/**
 * Get online users in conversation
 */
function getOnlineUsers(conversationId, conversationMembers) {
  const onlineUsers = [];

  for (const member of conversationMembers) {
    const presence = getUserPresence(member.userId);
    if (presence.status === 'online') {
      onlineUsers.push({
        ...member,
        presence,
      });
    }
  }

  return onlineUsers;
}

/**
 * Check if user is online
 */
function isUserOnline(userId) {
  const userSessions = activeSessions.get(userId) || [];
  return userSessions.length > 0;
}

/**
 * Get all active sessions
 */
function getActiveSessions(userId) {
  return activeSessions.get(userId) || [];
}

/**
 * Get session count
 */
function getSessionCount() {
  return sessionConnections.size;
}

module.exports = {
  createSession,
  endSession,
  updateActivity,
  setUserStatus,
  getUserPresence,
  getMultiplePresence,
  getOnlineUsers,
  isUserOnline,
  getActiveSessions,
  getSessionCount,
};
