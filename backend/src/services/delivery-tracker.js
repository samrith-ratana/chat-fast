/**
 * Message Delivery Status Tracking
 * Implements delivery status (sent, delivered, read) for messages
 */

// Track message delivery status
const deliveryStatus = new Map();  // messageId -> { deliveredAt, readAt, readBy[] }

/**
 * Mark message as delivered (reached server)
 */
function markAsDelivered(messageId, conversationId) {
  if (!deliveryStatus.has(messageId)) {
    deliveryStatus.set(messageId, {
      messageId,
      conversationId,
      sentAt: Date.now(),
      deliveredAt: Date.now(),
      readAt: null,
      readBy: [],
    });
  } else {
    const status = deliveryStatus.get(messageId);
    status.deliveredAt = Date.now();
  }

  return deliveryStatus.get(messageId);
}

/**
 * Mark message as read by user
 */
function markAsRead(messageId, userId, conversationId) {
  const status = deliveryStatus.get(messageId) || {
    messageId,
    conversationId,
    sentAt: Date.now(),
    deliveredAt: Date.now(),
    readAt: Date.now(),
    readBy: [{ userId, readAt: Date.now() }],
  };

  if (!status.readAt) {
    status.readAt = Date.now();
  }

  // Track who read the message
  if (!status.readBy.some((r) => r.userId === userId)) {
    status.readBy.push({
      userId,
      readAt: Date.now(),
    });
  }

  deliveryStatus.set(messageId, status);
  return status;
}

/**
 * Get delivery status for message
 */
function getDeliveryStatus(messageId) {
  return deliveryStatus.get(messageId) || null;
}

/**
 * Get delivery statuses for conversation
 */
function getConversationDeliveryStatus(conversationId, messageIds = []) {
  const statuses = {};

  for (const messageId of messageIds) {
    const status = deliveryStatus.get(messageId);
    if (status && status.conversationId === conversationId) {
      statuses[messageId] = {
        delivered: !!status.deliveredAt,
        read: !!status.readAt,
        readBy: status.readBy || [],
      };
    }
  }

  return statuses;
}

/**
 * Calculate delivery statistics for conversation
 */
function getConversationStats(conversationId) {
  let total = 0;
  let delivered = 0;
  let read = 0;

  for (const status of deliveryStatus.values()) {
    if (status.conversationId === conversationId) {
      total++;
      if (status.deliveredAt) delivered++;
      if (status.readAt) read++;
    }
  }

  return {
    total,
    delivered,
    read,
    deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
    readRate: total > 0 ? (read / total) * 100 : 0,
  };
}

/**
 * Cleanup old statuses (messages older than 30 days)
 */
function cleanupOldStatuses() {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const [messageId, status] of deliveryStatus.entries()) {
    if (status.sentAt < thirtyDaysAgo) {
      deliveryStatus.delete(messageId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`✓ Cleaned up ${cleaned} old delivery statuses`);
  }
}

// Auto-cleanup daily
setInterval(cleanupOldStatuses, 24 * 60 * 60 * 1000);

module.exports = {
  markAsDelivered,
  markAsRead,
  getDeliveryStatus,
  getConversationDeliveryStatus,
  getConversationStats,
  cleanupOldStatuses,
};
