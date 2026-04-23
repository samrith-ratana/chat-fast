# RelayChat Architecture

## System Diagram

```text
Browser
  ├─ AuthContext stores JWT access/refresh tokens
  ├─ ChatWorkspace fetches paginated history over REST
  ├─ WebSocket joins one conversation at a time
  ├─ PACK decoder reconstructs base/delta/reference entries
  └─ UI merges optimistic messages with server acks + receipts

Node Service
  ├─ Express API
  │   ├─ /api/auth/*
  │   ├─ /api/users/*
  │   ├─ /api/conversations/*
  │   └─ /api/files/*
  ├─ WebSocket Server
  │   ├─ hello / welcome handshake
  │   ├─ send_message
  │   ├─ sync
  │   └─ receipt_update / ack / ping
  └─ Shared Chat Runtime
      ├─ content-addressable message ids
      ├─ delta selection + reconstruction
      ├─ ordered conversation sequence index
      ├─ delivery/read receipt state
      └─ JSON persistence

Storage
  ├─ users.json
  ├─ conversations.json
  ├─ files.json
  ├─ chat-store.json
  └─ local file blobs
```

## Separation Of Concerns

- `backend/api.js`
  Builds the REST surface, validates inputs, enforces auth/origin/rate-limit middleware, and maps runtime/models to HTTP responses.
- `backend/server.js`
  Owns HTTP boot, WebSocket lifecycle, packfile encoding, heartbeat, reconnect sync, and receipt fanout.
- `backend/src/chat/runtime.js`
  Central message system: deduplication, delta selection, sequence assignment, history pagination, read/delivery tracking, and persistence.
- `backend/src/models/index.js`
  JSON-backed user, conversation, and file metadata stores.
- `chat-front/src/components/chat/ChatWorkspace.tsx`
  Main product UI: conversation switching, lazy history, websocket transport, optimistic messaging, file attachments, and inline previews.

## Core Algorithms

### Message Deduplication

```text
message_id = SHA256(content + stable(metadata))
stable(metadata) = {
  client_tag,
  conversation_id,
  sender_id,
  stream_id,
  timestamp,
  attachment_ids
}
```

- Duplicate sends from retries produce the same immutable id.
- `client_tag` replay guards reject a reused client token for different payloads.

### Delta Compression

- The runtime searches recent conversation messages for a likely base.
- It prefers the same sender or a nearby payload size to maximize delta wins.
- Deltas are only kept when materially smaller than a base payload.
- Chain depth is capped, preventing pathological decode cost on the client.

### Chat Synchronization

- Client connects with:
  - `last_known_message_id`
  - `known_object_ids`
- Server returns only missing messages after the last confirmed object.
- If the client cannot resolve a delta base, it requests sync again.

### Conflict Resolution / Ordering

- The server assigns a monotonic `sequence` number per conversation.
- UI ordering prefers `sequence`; optimistic local rows fall back to timestamp until ack.
- Out-of-order websocket arrival is harmless because the final order is sequence-driven.

## Realtime Protocol

### Why `PACK`

- REST is used for bootstrap/history/search/upload.
- WebSocket carries frequent low-latency state.
- `PACK` frames reduce repeated JSON structure and allow base/delta/reference object reuse.

### Frame Types

- `base`
  Full content + attachment payload
- `delta`
  Patch text + attachment payload, resolved against `base_id`
- `reference`
  Reuse an object already cached client-side

## Bandwidth Optimizations

- Deflate-compressed pack batches
- Delta updates for text reuse
- Reference entries when peers already have the object
- Micro-batching on broadcast
- Pagination and lazy history loading
- Reconnect sync from a cursor instead of full replay

## Security Model

- JWT bearer auth for REST and WebSocket handshake
- bcrypt password hashing
- Request origin checks on mutation endpoints
- Input sanitization for message text, usernames, and filenames
- In-memory rate limiting for HTTP mutations and WebSocket sends
- File access via signed preview tokens or authenticated membership checks
