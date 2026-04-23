# RelayChat

Production-style chat platform built for low-bandwidth environments. The stack combines a Next.js client, a unified Node.js API/WebSocket service, JSON-backed persistence, file uploads with inline preview, and a packfile-inspired realtime protocol.

## Delivered

- Public web UI with registration, login, protected chat workspace, direct chat, and group chat
- JWT authentication with bcrypt password hashing
- WebSocket realtime messaging with optimistic UI, sent/delivered/read receipts, reconnect sync, batching, and throttling
- File upload + inline preview for images, PDFs, and text
- Paginated chat history backed by JSON storage
- Low-bandwidth transport using compressed binary `PACK` frames plus delta updates
- Security controls: input sanitization, origin checks, JWT middleware, rate limiting, and safer file serving

## Architecture

```text
Next.js Client
  ├─ auth shell + protected routes
  ├─ optimistic outbox
  ├─ lazy-loaded message history
  ├─ file preview renderer
  └─ PACK decoder + delta resolver

Unified Node Service
  ├─ Express REST API
  ├─ WebSocket gateway
  ├─ shared chat runtime
  ├─ receipt broadcaster
  └─ micro-batched compressor

Persistence / Storage
  ├─ backend/data/users.json
  ├─ backend/data/conversations.json
  ├─ backend/data/files.json
  ├─ backend/data/chat-store.json
  └─ backend/storage/files/*
```

## Folder Structure

```text
backend/
  api.js                     REST API construction
  server.js                  HTTP + WebSocket server
  src/auth/                  JWT + bcrypt auth helpers
  src/chat/runtime.js        shared message store, dedupe, delta logic
  src/lib/                   validation, security, rate limiting
  src/models/                JSON-backed user/conversation/file stores
  data/                      persisted metadata and message index
  storage/files/             uploaded file blobs

chat-front/
  src/app/                   Next.js routes
  src/components/Auth/       login/register/protected route
  src/components/chat/       workspace UI
  src/context/               auth state
  src/hooks/                 upload hook
  src/lib/                   API and PACK helpers
  src/types/                 shared frontend types
```

## Quick Start

```bash
cd backend
npm install
npm run dev
```

```bash
cd chat-front
npm install
npm run dev
```

Default endpoints:

- API: `http://localhost:8080`
- WebSocket: `ws://localhost:8080`
- Frontend: `http://localhost:3000`

## Key Implementation Files

- Backend transport/runtime: `backend/server.js`, `backend/src/chat/runtime.js`
- Backend API/security: `backend/api.js`, `backend/src/auth/*`, `backend/src/lib/*`
- Frontend workspace: `chat-front/src/components/chat/ChatWorkspace.tsx`
- Frontend protocol helpers: `chat-front/src/lib/chatProtocol.ts`

## Optimization Notes

- Message deduplication uses `SHA-256(content + immutable metadata)` to guarantee idempotent writes.
- Delta compression reuses nearby/base messages and caps chain depth to keep decoding cheap.
- Binary `PACK` frames remove repetitive JSON keys and are deflated before transmit.
- Sync requests send `last_known_message_id` plus cached object ids so reconnect only transfers the missing slice.
- Pending broadcasts are micro-batched to reduce packet overhead for active rooms.

## Documentation

- Architecture and algorithms: [ARCHITECTURE.md](./ARCHITECTURE.md)
- REST + WebSocket contract and JSON examples: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
# chat-fast
