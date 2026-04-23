const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const zlib = require('zlib');

const { createApp } = require('./api');
const { verifyToken } = require('./src/auth/jwt');
const { Conversation, User } = require('./src/models');
const { createChatRuntime } = require('./src/chat/runtime');

const PORT = Number(process.env.PORT || 8080);
const PACK_MAGIC = 'PACK';
const PACK_VERSION = 1;
const PACK_CODEC_ZLIB = 1;
const PACK_FLUSH_MS = 12;
const HEARTBEAT_MS = 15_000;
const MAX_SYNC_BATCH = 32;
const MAX_KNOWN_OBJECT_IDS = 128;
const MESSAGE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 80;

const TYPE_TO_BYTE = {
  base: 0,
  delta: 1,
  reference: 2,
};

const runtime = createChatRuntime();
const clientState = new Map();
const pendingBroadcasts = new Map();

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest();
}

function rememberKnownObject(state, objectId) {
  if (!objectId) {
    return;
  }

  if (state.knownObjects.has(objectId)) {
    state.knownObjects.delete(objectId);
  }
  state.knownObjects.add(objectId);

  while (state.knownObjects.size > MAX_KNOWN_OBJECT_IDS) {
    const oldest = state.knownObjects.keys().next().value;
    state.knownObjects.delete(oldest);
  }
}

function sendControlFrame(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(payload));
}

function encodeEntry(message) {
  const typeByte = TYPE_TO_BYTE[message.type] ?? TYPE_TO_BYTE.base;
  const flags = message.is_final ? 1 : 0;
  const idBuffer = Buffer.from(message.id, 'hex');
  const baseIdBuffer = message.base_id ? Buffer.from(message.base_id, 'hex') : Buffer.alloc(32);
  const senderBuffer = Buffer.from(message.sender_id || '', 'utf8');
  const conversationBuffer = Buffer.from(message.conversation_id || '', 'utf8');
  const clientTagBuffer = Buffer.from(message.client_tag || '', 'utf8');
  const streamIdBuffer = Buffer.from(message.stream_id || '', 'utf8');
  const payloadBuffer = Buffer.from(
    message.type === 'base'
      ? JSON.stringify({
          content: runtime.materializeContent(message),
          attachments: message.attachments || [],
        })
      : message.type === 'delta'
        ? JSON.stringify({
            delta: message.delta || '',
            attachments: message.attachments || [],
          })
        : '',
    'utf8',
  );

  const prefix = Buffer.alloc(102);
  let offset = 0;
  prefix.writeUInt8(typeByte, offset);
  offset += 1;
  prefix.writeUInt8(flags, offset);
  offset += 1;
  idBuffer.copy(prefix, offset);
  offset += 32;
  baseIdBuffer.copy(prefix, offset);
  offset += 32;
  prefix.writeBigUInt64BE(BigInt(message.timestamp), offset);
  offset += 8;
  prefix.writeBigUInt64BE(BigInt(message.sequence || 0), offset);
  offset += 8;
  prefix.writeUInt32BE(message.chunk_index || 0, offset);
  offset += 4;
  prefix.writeUInt32BE(message.total_chunks || 1, offset);
  offset += 4;
  prefix.writeUInt16BE(senderBuffer.length, offset);
  offset += 2;
  prefix.writeUInt16BE(conversationBuffer.length, offset);
  offset += 2;
  prefix.writeUInt16BE(clientTagBuffer.length, offset);
  offset += 2;
  prefix.writeUInt16BE(streamIdBuffer.length, offset);
  offset += 2;
  prefix.writeUInt32BE(payloadBuffer.length, offset);

  return Buffer.concat([
    prefix,
    senderBuffer,
    conversationBuffer,
    clientTagBuffer,
    streamIdBuffer,
    payloadBuffer,
  ]);
}

function buildPackfile(messages) {
  const entries = messages.map(encodeEntry);
  const entriesByteLength = entries.reduce((sum, entry) => sum + entry.length, 0);
  const header = Buffer.alloc(16);

  header.write(PACK_MAGIC, 0, 4, 'ascii');
  header.writeUInt16BE(PACK_VERSION, 4);
  header.writeUInt8(PACK_CODEC_ZLIB, 6);
  header.writeUInt8(0, 7);
  header.writeUInt32BE(messages.length, 8);
  header.writeUInt32BE(entriesByteLength, 12);

  const uncompressed = Buffer.concat([header, ...entries]);
  const compressed = zlib.deflateSync(uncompressed);
  return Buffer.concat([compressed, sha256Buffer(uncompressed)]);
}

function prepareEntryForClient(message, knownObjects) {
  if (knownObjects.has(message.id)) {
    return {
      ...message,
      type: 'reference',
      content: '',
      delta: '',
      base_id: null,
    };
  }

  if (message.type === 'delta' && message.base_id && knownObjects.has(message.base_id)) {
    return message;
  }

  return {
    ...message,
    type: 'base',
    content: runtime.materializeContent(message),
    delta: '',
    base_id: null,
  };
}

function broadcastReceiptUpdates(conversationId, updates) {
  if (!updates.length) {
    return;
  }

  clientState.forEach((state, ws) => {
    if (state.conversationId !== conversationId || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    sendControlFrame(ws, {
      type: 'receipt_update',
      conversation_id: conversationId,
      updates,
    });
  });
}

function sendPack(ws, messages, reason) {
  const state = clientState.get(ws);
  if (!state || ws.readyState !== WebSocket.OPEN || !messages.length) {
    return;
  }

  const entries = messages.map((message) => prepareEntryForClient(message, state.knownObjects));
  const packet = buildPackfile(entries);

  ws.send(packet, { binary: true }, (error) => {
    if (error) {
      console.error('pack send failed', error);
      return;
    }

    entries.forEach((entry) => rememberKnownObject(state, entry.id));
    sendControlFrame(ws, {
      type: 'pack_sent',
      reason,
      entries: entries.length,
      bytes: packet.length,
    });

    if (state.userId) {
      const updates = runtime.markDelivered(
        state.conversationId,
        messages.map((message) => message.id),
        state.userId,
      );
      broadcastReceiptUpdates(state.conversationId, updates);
    }
  });
}

function handleSync(ws, payload) {
  const state = clientState.get(ws);
  if (!state || !state.userId || !state.conversationId) {
    return;
  }

  const missingMessages = runtime.getMissingMessages(
    state.conversationId,
    payload.last_known_message_id || '',
  );

  runtime.chunkMessages(missingMessages, MAX_SYNC_BATCH).forEach((batch) => {
    sendPack(ws, batch, 'sync');
  });

  sendControlFrame(ws, {
    type: 'sync_complete',
    conversation_id: state.conversationId,
    count: missingMessages.length,
  });
}

function flushBroadcast(conversationId) {
  const pending = pendingBroadcasts.get(conversationId);
  if (!pending) {
    return;
  }

  pendingBroadcasts.delete(conversationId);
  const messages = pending.ids
    .map((messageId) => runtime.messageStore.get(messageId))
    .filter(Boolean);

  clientState.forEach((state, ws) => {
    if (state.conversationId !== conversationId || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    sendPack(ws, messages, pending.reason);
  });
}

function enqueueBroadcast(message, reason = 'broadcast') {
  if (!pendingBroadcasts.has(message.conversation_id)) {
    pendingBroadcasts.set(message.conversation_id, {
      ids: [],
      timer: null,
      reason,
    });
  }

  const pending = pendingBroadcasts.get(message.conversation_id);
  pending.reason = reason;
  pending.ids.push(message.id);

  if (!pending.timer) {
    pending.timer = setTimeout(() => flushBroadcast(message.conversation_id), PACK_FLUSH_MS);
  }
}

function broadcastMessagePack(conversationId, messages, reason = 'broadcast') {
  messages.forEach((message) => enqueueBroadcast(message, reason));
}

function reject(ws, code, message) {
  sendControlFrame(ws, { type: 'nack', code, message });
}

function validateConnection(payload) {
  const token = String(payload.token || '');
  const result = verifyToken(token);
  if (!result.ok || result.payload.type !== 'access') {
    return { ok: false, reason: 'token validation failed' };
  }

  if (result.payload.sub !== payload.user_id) {
    return { ok: false, reason: 'token user mismatch' };
  }

  const conversation = Conversation.findById(payload.conversation_id);
  if (!conversation || !conversation.members.some((member) => member.user_id === payload.user_id)) {
    return { ok: false, reason: 'conversation membership required' };
  }

  return {
    ok: true,
    userId: result.payload.sub,
  };
}

function enforceMessageRateLimit(state) {
  const now = Date.now();
  if (now > state.rateWindow.resetAt) {
    state.rateWindow = {
      count: 0,
      resetAt: now + MESSAGE_WINDOW_MS,
    };
  }

  state.rateWindow.count += 1;
  return state.rateWindow.count <= MAX_MESSAGES_PER_WINDOW;
}

function scheduleDemoStream(conversationId, prompt) {
  const streamId = crypto.randomUUID();
  const fullResponse =
    `Realtime sync for "${prompt}" uses immutable message ids, delta-aware pack batches, and read receipts that converge on every client.` +
    ' Later chunks reuse earlier text as their base object so bandwidth stays low while the UI still updates immediately.';

  const cuts = [0.25, 0.5, 0.76, 1];
  cuts.forEach((ratio, index) => {
    setTimeout(() => {
      try {
        const partial = fullResponse.slice(0, Math.max(1, Math.floor(fullResponse.length * ratio)));
        const { message } = runtime.storeIncomingMessage({
          content: partial,
          timestamp: Date.now(),
          sender_id: 'edge-bot@system.local',
          conversation_id: conversationId,
          client_tag: `stream:${streamId}:${index}`,
          stream_id: streamId,
          chunk_index: index,
          total_chunks: cuts.length,
          is_final: index === cuts.length - 1,
        });

        enqueueBroadcast(message);
      } catch (error) {
        console.error('demo stream failed', error);
      }
    }, 180 * (index + 1));
  });
}

const app = createApp({
  runtime,
  realtime: {
    broadcastMessagePack,
    broadcastReceiptUpdates,
  },
});
const server = http.createServer(app);
server.requestTimeout = 0;
server.timeout = 0;
server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  clientState.set(ws, {
    userId: '',
    conversationId: '',
    knownObjects: new Set(),
    lastPongAt: Date.now(),
    rateWindow: {
      count: 0,
      resetAt: Date.now() + MESSAGE_WINDOW_MS,
    },
  });

  sendControlFrame(ws, {
    type: 'hello',
    pack_version: PACK_VERSION,
    heartbeat_ms: HEARTBEAT_MS,
    transport: 'websocket',
    compression: 'zlib',
  });

  ws.on('message', (rawData, isBinary) => {
    if (isBinary) {
      reject(ws, 'binary_not_supported', 'client requests must be JSON control frames');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawData.toString());
    } catch {
      reject(ws, 'invalid_json', 'could not parse JSON frame');
      return;
    }

    const state = clientState.get(ws);
    if (!state) {
      return;
    }

    try {
      switch (payload.type) {
        case 'hello': {
          const auth = validateConnection(payload);
          if (!auth.ok) {
            reject(ws, 'unauthorized', auth.reason);
            ws.close(4001, auth.reason);
            return;
          }

          state.userId = auth.userId;
          state.conversationId = payload.conversation_id;
          state.lastPongAt = Date.now();

          (Array.isArray(payload.known_object_ids) ? payload.known_object_ids : [])
            .slice(-MAX_KNOWN_OBJECT_IDS)
            .forEach((objectId) => {
              if (typeof objectId === 'string' && objectId.length === 64) {
                rememberKnownObject(state, objectId);
              }
            });

          User.setStatus(state.userId, 'online');
          sendControlFrame(ws, {
            type: 'welcome',
            user_id: state.userId,
            conversation_id: state.conversationId,
            heartbeat_ms: HEARTBEAT_MS,
            pack_version: PACK_VERSION,
            compression: 'zlib',
          });

          handleSync(ws, payload);
          break;
        }

        case 'sync': {
          handleSync(ws, payload);
          break;
        }

        case 'send_message': {
          if (!state.userId || payload.sender_id !== state.userId) {
            reject(ws, 'forbidden', 'sender is not bound to this connection');
            return;
          }

          if (payload.conversation_id !== state.conversationId) {
            reject(ws, 'conversation_mismatch', 'message conversation does not match joined room');
            return;
          }

          if (!enforceMessageRateLimit(state)) {
            reject(ws, 'rate_limited', 'message rate limit exceeded');
            return;
          }

          const { message, duplicate } = runtime.storeIncomingMessage({
            content: String(payload.content || ''),
            timestamp: Number(payload.timestamp || Date.now()),
            sender_id: state.userId,
            conversation_id: state.conversationId,
            message_id: payload.message_id || '',
            client_tag: payload.client_tag || '',
            stream_id: payload.stream_id || '',
            chunk_index: Number(payload.chunk_index || 0),
            total_chunks: Number(payload.total_chunks || 1),
            is_final: payload.is_final !== false,
            attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
          });

          sendControlFrame(ws, {
            type: 'ack',
            client_tag: message.client_tag,
            message_id: message.id,
            sequence: message.sequence,
            deduplicated: duplicate,
            stored_as: message.type,
          });

          if (!duplicate) {
            enqueueBroadcast(message);
          }

          if (payload.request_demo_stream) {
            scheduleDemoStream(state.conversationId, String(payload.content || 'bandwidth-aware chat'));
          }

          break;
        }

        case 'pong': {
          state.lastPongAt = Date.now();
          break;
        }

        default: {
          reject(ws, 'unknown_type', `unsupported frame type "${payload.type}"`);
        }
      }
    } catch (error) {
      reject(ws, 'server_error', error.message);
    }
  });

  ws.on('close', () => {
    const state = clientState.get(ws);
    if (state?.userId) {
      User.setStatus(state.userId, 'offline');
    }
    clientState.delete(ws);
  });
});

setInterval(() => {
  const now = Date.now();
  clientState.forEach((state, ws) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (now - state.lastPongAt > HEARTBEAT_MS * 2) {
      ws.terminate();
      clientState.delete(ws);
      return;
    }

    sendControlFrame(ws, { type: 'ping', ts: now });
  });
}, HEARTBEAT_MS);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another backend instance is already running.`);
    console.error(`Stop the existing process or run this server on a different port.`);
    process.exit(1);
  }

  console.error('Server failed to start:', error.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Chat platform running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
