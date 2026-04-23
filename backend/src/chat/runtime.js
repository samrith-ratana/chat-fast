const { EventEmitter } = require('events');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DiffMatchPatch = require('diff-match-patch');

const { Conversation, File } = require('../models');
const { ensureArray, parseLimit, sanitizePlainText } = require('../lib/validation');

const dmp = new DiffMatchPatch.diff_match_patch();
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'chat-store.json');
const MAX_DELTA_CHAIN = 4;
const MAX_SYNC_BATCH = 32;
const MAX_REPLAY_KEYS_PER_USER = 256;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableMetadata(metadata) {
  return JSON.stringify({
    client_tag: metadata.client_tag || '',
    conversation_id: metadata.conversation_id,
    sender_id: metadata.sender_id,
    stream_id: metadata.stream_id || '',
    timestamp: metadata.timestamp,
    attachment_ids: ensureArray(metadata.attachment_ids).map((value) => String(value)),
  });
}

function computeMessageId(content, metadata) {
  return sha256Hex(`${content}\u001f${stableMetadata(metadata)}`);
}

function createChatRuntime() {
  const events = new EventEmitter();
  const messageStore = new Map();
  const conversationStore = new Map();
  const replayGuards = new Map();
  let persistTimer = null;

  function ensureConversationState(conversationId) {
    if (!conversationStore.has(conversationId)) {
      conversationStore.set(conversationId, {
        orderedIds: [],
        nextSequence: 1,
        streamHeads: new Map(),
      });
    }

    return conversationStore.get(conversationId);
  }

  function schedulePersistence() {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistState();
    }, 75);
  }

  function persistState() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const serialized = {
      saved_at: new Date().toISOString(),
      conversations: Array.from(conversationStore.entries()).map(([conversationId, conversation]) => ({
        conversation_id: conversationId,
        ordered_ids: conversation.orderedIds,
        next_sequence: conversation.nextSequence,
        stream_heads: Array.from(conversation.streamHeads.entries()),
      })),
      messages: Array.from(messageStore.values()),
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(serialized, null, 2), 'utf8');
  }

  function hydrateState() {
    if (!fs.existsSync(DATA_FILE)) {
      return;
    }

    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) {
      return;
    }

    const parsed = JSON.parse(raw);
    ensureArray(parsed.messages).forEach((message) => {
      messageStore.set(message.id, message);
    });

    ensureArray(parsed.conversations).forEach((conversation) => {
      conversationStore.set(conversation.conversation_id, {
        orderedIds: ensureArray(conversation.ordered_ids),
        nextSequence: Number(conversation.next_sequence || 1),
        streamHeads: new Map(ensureArray(conversation.stream_heads)),
      });
    });
  }

  function materializeContent(message) {
    if (!message) {
      return '';
    }

    if (message.resolved_content) {
      return message.resolved_content;
    }

    if (message.type === 'base') {
      message.resolved_content = message.content || '';
      return message.resolved_content;
    }

    if (message.type === 'delta' && message.base_id) {
      const base = messageStore.get(message.base_id);
      const baseContent = materializeContent(base);
      const patches = dmp.patch_fromText(message.delta || '');
      const [result] = dmp.patch_apply(patches, baseContent);
      message.resolved_content = result;
      return result;
    }

    return '';
  }

  function getDeltaChainDepth(messageId) {
    let depth = 0;
    let current = messageStore.get(messageId);

    while (current && current.type === 'delta' && current.base_id) {
      depth += 1;
      current = messageStore.get(current.base_id);
    }

    return depth;
  }

  function selectDeltaBase(conversation, incoming) {
    if (incoming.stream_id && conversation.streamHeads.has(incoming.stream_id)) {
      return messageStore.get(conversation.streamHeads.get(incoming.stream_id));
    }

    for (let index = conversation.orderedIds.length - 1; index >= 0; index -= 1) {
      const candidate = messageStore.get(conversation.orderedIds[index]);
      if (!candidate) {
        continue;
      }

      const candidateContent = materializeContent(candidate);
      if (!candidateContent) {
        continue;
      }

      const sameSender = candidate.sender_id === incoming.sender_id;
      const similarSize = Math.abs(candidateContent.length - incoming.content.length) <= 512;
      if (sameSender || similarSize) {
        return candidate;
      }

      if (conversation.orderedIds.length - index > 8) {
        break;
      }
    }

    return null;
  }

  function encodeDelta(baseContent, nextContent) {
    const patches = dmp.patch_make(baseContent, nextContent);
    return dmp.patch_toText(patches);
  }

  function shouldUseDelta(baseMessage, deltaText, nextContent) {
    if (!baseMessage || !deltaText.length) {
      return false;
    }

    if (getDeltaChainDepth(baseMessage.id) >= MAX_DELTA_CHAIN) {
      return false;
    }

    const deltaBytes = Buffer.byteLength(deltaText, 'utf8');
    const contentBytes = Buffer.byteLength(nextContent, 'utf8');
    return deltaBytes + 48 < contentBytes * 0.88;
  }

  function rememberReplayKey(userId, clientTag, messageId) {
    if (!clientTag) {
      return { ok: true };
    }

    if (!replayGuards.has(userId)) {
      replayGuards.set(userId, new Map());
    }

    const guard = replayGuards.get(userId);
    const existing = guard.get(clientTag);
    if (existing && existing !== messageId) {
      return { ok: false, reason: 'client tag reused for a different payload' };
    }

    guard.delete(clientTag);
    guard.set(clientTag, messageId);

    while (guard.size > MAX_REPLAY_KEYS_PER_USER) {
      const oldest = guard.keys().next().value;
      guard.delete(oldest);
    }

    return {
      ok: true,
      duplicateId: existing || null,
    };
  }

  function normalizeAttachments(attachments, conversationId) {
    return ensureArray(attachments).map((attachment) => {
      const file = attachment && attachment.file_id ? File.findById(attachment.file_id) : null;
      if (!file) {
        throw new Error('Attachment file not found');
      }

      if (file.conversation_id !== conversationId) {
        throw new Error('Attachment conversation mismatch');
      }

      return {
        file_id: file._id,
        filename: file.original_filename,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        preview: file.preview,
      };
    });
  }

  function getMessageForApi(message) {
    const content = materializeContent(message);
    return {
      id: message.id,
      conversation_id: message.conversation_id,
      sender_id: message.sender_id,
      content,
      timestamp: message.timestamp,
      sequence: message.sequence,
      client_tag: message.client_tag,
      stream_id: message.stream_id,
      chunk_index: message.chunk_index,
      total_chunks: message.total_chunks,
      is_final: message.is_final,
      stored_as: message.type,
      attachments: ensureArray(message.attachments),
      delivery: message.delivery || { sent_at: message.timestamp, delivered_to: {}, read_by: {} },
    };
  }

  function storeIncomingMessage(payload) {
    const conversation = ensureConversationState(payload.conversation_id);
    const content = payload.content ? sanitizePlainText(payload.content, { maxLength: 4000, allowEmpty: true }) : '';
    const attachments = normalizeAttachments(payload.attachments, payload.conversation_id);

    if (!content && attachments.length === 0) {
      throw new Error('Message content or attachments are required');
    }

    const metadata = {
      timestamp: payload.timestamp,
      sender_id: payload.sender_id,
      conversation_id: payload.conversation_id,
      client_tag: payload.client_tag || '',
      stream_id: payload.stream_id || '',
      attachment_ids: attachments.map((attachment) => attachment.file_id),
    };

    const computedId = computeMessageId(content, metadata);
    if (payload.message_id && payload.message_id !== computedId) {
      throw new Error('Message hash mismatch');
    }

    const replay = rememberReplayKey(payload.sender_id, payload.client_tag, computedId);
    if (!replay.ok) {
      throw new Error(replay.reason);
    }

    if (messageStore.has(computedId)) {
      return {
        message: messageStore.get(computedId),
        duplicate: true,
      };
    }

    const baseCandidate = content ? selectDeltaBase(conversation, { ...payload, content }) : null;
    const baseContent = baseCandidate ? materializeContent(baseCandidate) : '';
    const deltaText = baseCandidate ? encodeDelta(baseContent, content) : '';
    const useDelta = content ? shouldUseDelta(baseCandidate, deltaText, content) : false;
    const now = Date.now();

    const message = {
      id: computedId,
      type: useDelta ? 'delta' : 'base',
      content: useDelta ? '' : content,
      resolved_content: content,
      base_id: useDelta ? baseCandidate.id : null,
      delta: useDelta ? deltaText : '',
      timestamp: payload.timestamp,
      sender_id: payload.sender_id,
      conversation_id: payload.conversation_id,
      sequence: conversation.nextSequence,
      client_tag: payload.client_tag || '',
      stream_id: payload.stream_id || '',
      chunk_index: payload.chunk_index || 0,
      total_chunks: payload.total_chunks || 1,
      is_final: payload.is_final !== false,
      attachments,
      delivery: {
        sent_at: now,
        delivered_to: {
          [payload.sender_id]: now,
        },
        read_by: {
          [payload.sender_id]: now,
        },
      },
    };

    conversation.nextSequence += 1;
    conversation.orderedIds.push(message.id);

    if (message.stream_id) {
      conversation.streamHeads.set(message.stream_id, message.id);
    }

    messageStore.set(message.id, message);
    attachments.forEach((attachment) => {
      File.update(attachment.file_id, { message_id: message.id });
    });
    Conversation.touch(message.conversation_id, message);
    schedulePersistence();
    events.emit('message_stored', message);

    return {
      message,
      duplicate: false,
    };
  }

  function getMessage(messageId) {
    const message = messageStore.get(messageId);
    return message ? getMessageForApi(message) : null;
  }

  function listMessages(conversationId, options = {}) {
    const limit = parseLimit(options.limit, 30, 100);
    const beforeSequence = options.beforeSequence ? Number(options.beforeSequence) : null;
    const state = ensureConversationState(conversationId);
    const orderedMessages = state.orderedIds
      .map((id) => messageStore.get(id))
      .filter(Boolean);

    const eligible = beforeSequence
      ? orderedMessages.filter((message) => message.sequence < beforeSequence)
      : orderedMessages;
    const page = eligible.slice(-limit);
    const hasMore = eligible.length > page.length;

    return {
      messages: page.map(getMessageForApi),
      next_cursor: hasMore && page.length ? page[0].sequence : null,
      has_more: hasMore,
    };
  }

  function getMissingMessages(conversationId, lastKnownMessageId) {
    const state = ensureConversationState(conversationId);
    if (!lastKnownMessageId) {
      return state.orderedIds.map((id) => messageStore.get(id)).filter(Boolean);
    }

    const index = state.orderedIds.indexOf(lastKnownMessageId);
    const sliceFrom = index >= 0 ? index + 1 : 0;
    return state.orderedIds.slice(sliceFrom).map((id) => messageStore.get(id)).filter(Boolean);
  }

  function chunkMessages(messages, size = MAX_SYNC_BATCH) {
    const chunks = [];
    for (let index = 0; index < messages.length; index += size) {
      chunks.push(messages.slice(index, index + size));
    }
    return chunks;
  }

  function markDelivered(conversationId, messageIds, userId) {
    const updates = [];
    ensureArray(messageIds).forEach((messageId) => {
      const message = messageStore.get(messageId);
      if (!message || message.conversation_id !== conversationId) {
        return;
      }

      if (!message.delivery) {
        message.delivery = { sent_at: Date.now(), delivered_to: {}, read_by: {} };
      }

      if (message.delivery.delivered_to[userId]) {
        return;
      }

      const deliveredAt = Date.now();
      message.delivery.delivered_to[userId] = deliveredAt;
      updates.push({
        message_id: message.id,
        sequence: message.sequence,
        delivered_to: {
          [userId]: deliveredAt,
        },
        read_by: {},
      });
    });

    if (updates.length) {
      schedulePersistence();
      events.emit('receipt_updated', { conversation_id: conversationId, updates });
    }

    return updates;
  }

  function markRead(conversationId, userId, options = {}) {
    const state = ensureConversationState(conversationId);
    const upToSequence = options.upToSequence
      ? Number(options.upToSequence)
      : options.messageId
        ? messageStore.get(options.messageId)?.sequence || 0
        : 0;

    const updates = [];
    state.orderedIds.forEach((messageId) => {
      const message = messageStore.get(messageId);
      if (!message || message.sequence > upToSequence) {
        return;
      }

      if (!message.delivery) {
        message.delivery = { sent_at: Date.now(), delivered_to: {}, read_by: {} };
      }

      const readAt = message.delivery.read_by[userId];
      if (readAt) {
        return;
      }

      const now = Date.now();
      message.delivery.read_by[userId] = now;
      message.delivery.delivered_to[userId] = message.delivery.delivered_to[userId] || now;
      updates.push({
        message_id: message.id,
        sequence: message.sequence,
        delivered_to: {
          [userId]: message.delivery.delivered_to[userId],
        },
        read_by: {
          [userId]: now,
        },
      });
    });

    if (updates.length) {
      schedulePersistence();
      events.emit('receipt_updated', { conversation_id: conversationId, updates });
    }

    return updates;
  }

  function getConversationStats(conversationId) {
    const state = ensureConversationState(conversationId);
    const lastId = state.orderedIds[state.orderedIds.length - 1];
    const lastMessage = lastId ? messageStore.get(lastId) : null;

    return {
      message_count: state.orderedIds.length,
      next_sequence: state.nextSequence,
      last_message: lastMessage ? getMessageForApi(lastMessage) : null,
    };
  }

  function getArchitectureSnapshot() {
    return {
      websocket: {
        transport: 'ws',
        compression: 'zlib/deflate',
        batching_ms: 12,
        serialization: 'binary PACK frames',
      },
      storage: {
        metadata: 'JSON files under backend/data',
        message_store: DATA_FILE,
        file_store: path.join(DATA_DIR, '../storage/files'),
      },
      algorithms: {
        deduplication: 'SHA-256(content + immutable metadata)',
        delta_compression: 'diff-match-patch with bounded chain depth',
        synchronization: 'last_known_message_id + known_object_ids',
        ordering: 'server-assigned monotonic sequence per conversation',
      },
    };
  }

  hydrateState();

  return {
    chunkMessages,
    computeMessageId,
    events,
    getArchitectureSnapshot,
    getConversationStats,
    getMessage,
    getMessageForApi,
    getMissingMessages,
    listMessages,
    markDelivered,
    markRead,
    materializeContent,
    messageStore,
    persistState,
    stableMetadata,
    storeIncomingMessage,
  };
}

module.exports = {
  MAX_DELTA_CHAIN,
  MAX_SYNC_BATCH,
  computeMessageId,
  createChatRuntime,
  stableMetadata,
};
