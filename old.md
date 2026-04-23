# Production-Grade Chat Platform - Complete Architecture

## Executive Summary

A high-performance, distributed chat platform designed for thousands of concurrent users with:
- **Real-time messaging** via WebSocket with PACK binary protocol
- **Content-addressable storage** with delta compression for bandwidth optimization
- **Distributed architecture** supporting horizontal scaling
- **Enterprise security** with JWT authentication, encryption, and rate limiting
- **Comprehensive features**: 1-to-1 chat, group chat, file sharing, message search, read receipts

---

## 1. SYSTEM ARCHITECTURE DIAGRAM

### High-Level Overview
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (Browser)                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Next.js React Application                                           │  │
│  │  ├─ Auth Module (JWT token management, login/register UI)           │  │
│  │  ├─ Chat UI (optimistic rendering, message reconciliation)          │  │
│  │  ├─ File Upload Handler (preview, compression, chunking)            │  │
│  │  ├─ Delta Resolver (diff-match-patch for message reconstruction)    │  │
│  │  ├─ Local CAS Cache (content-addressable store in IndexedDB)        │  │
│  │  ├─ Outbox Queue (idempotent message dispatch)                      │  │
│  │  └─ WebSocket Transport (binary PACK protocol, auto-reconnect)      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↕
                          WebSocket (ws/wss)
                          Binary PACK + Control Frames
                                    ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY / LOAD BALANCER                            │
│  (Sticky sessions for WebSocket, health checks, rate limiting)              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND CLUSTER (Horizontally Scalable)                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Node.js Server Instance                                             │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  AUTH & SECURITY LAYER                                          │  │  │
│  │  │  ├─ JWT Validation & Token Refresh                              │  │  │
│  │  │  ├─ Rate Limiter (Redis-backed for distributed)                 │  │  │
│  │  │  ├─ Input Validation & Sanitization                             │  │  │
│  │  │  ├─ CSRF Protection                                             │  │  │
│  │  │  └─ Encryption (AES-256 for sensitive data)                     │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  WEBSOCKET SERVER (ws@8080 - multi-instance)                    │  │  │
│  │  │  ├─ Connection Manager (session tracking, heartbeat)            │  │  │
│  │  │  ├─ Message Handler (validation, deduplication, routing)        │  │  │
│  │  │  ├─ Broadcast Coordinator (pack batching, delta selection)      │  │  │
│  │  │  └─ Replay Guard (client_tag tracking, idempotency)             │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  REST API ROUTES (Express @3000)                                │  │  │
│  │  │  ├─ /api/auth/* (login, register, refresh, logout)             │  │  │
│  │  │  ├─ /api/users/* (profile, search, relationships)              │  │  │
│  │  │  ├─ /api/conversations/* (create, list, members, settings)     │  │  │
│  │  │  ├─ /api/messages/* (search, pagination, delete, pin)          │  │  │
│  │  │  ├─ /api/files/* (upload, download, delete, preview)           │  │  │
│  │  │  └─ /api/admin/* (stats, moderation, user management)           │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  MESSAGE PROCESSING ENGINE                                      │  │  │
│  │  │  ├─ Delta Compression (diff-match-patch, max chain tracking)    │  │  │
│  │  │  ├─ Content-Addressable Store (SHA-256 based deduplication)     │  │  │
│  │  │  ├─ Sequence Numbering (monotonic, per-conversation)            │  │  │
│  │  │  ├─ Stream Handler (chunked messages, reassembly)               │  │  │
│  │  │  └─ Full-Text Indexing (for search capabilities)                │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                    ↓ ↓ ↓ (Sharding, Replication)
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA PERSISTENCE LAYER                                │
│  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────────────┐   │
│  │  PRIMARY DATABASE  │  │   CACHE LAYER      │  │  MESSAGE STORAGE    │   │
│  │  (MongoDB/SQL)     │  │   (Redis)          │  │  (JSON/LevelDB)     │   │
│  │  ├─ Users          │  │  ├─ Session tokens │  │  ├─ Messages        │   │
│  │  ├─ Conversations  │  │  ├─ Rate limits    │  │  ├─ Conversations   │   │
│  │  ├─ Message Meta   │  │  ├─ User cache     │  │  ├─ Files metadata  │   │
│  │  ├─ Files metadata │  │  └─ Object hashes  │  │  └─ Full-text index │   │
│  │  └─ User relations │  └────────────────────┘  └─────────────────────┘   │
│  └────────────────────┘                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  FILE STORAGE (S3/Object Storage or Local FS)                         │ │
│  │  ├─ Original files with versioning                                     │ │
│  │  ├─ Compressed copies (WebP for images, AVIF fallback)                │ │
│  │  ├─ Thumbnails (3 sizes: 48x48, 256x256, 1024x1024)                   │ │
│  │  ├─ PDF preview pages (first 5 pages as images)                        │ │
│  │  └─ Access control (signed URLs, expiration)                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SUPPORTING SERVICES                                       │
│  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────────────┐   │
│  │  MESSAGE QUEUE     │  │  NOTIFICATION SVC  │  │  SEARCH ENGINE      │   │
│  │  (Redis/RabbitMQ)  │  │  (Email/Push/SMS)  │  │  (Elasticsearch)    │   │
│  │  ├─ Async jobs     │  │  ├─ Mentions       │  │  ├─ Full-text index │   │
│  │  ├─ File processing│  │  ├─ Friend request │  │  ├─ Autocomplete    │   │
│  │  └─ Cleanup tasks  │  │  └─ Message notify │  │  └─ Message history │   │
│  └────────────────────┘  └────────────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Simplified Client-Server Flow
```
CLIENT                          WEBSOCKET                    SERVER
  │                               PACK                         │
  │ HELLO + JWT                    ──────→                      │
  │                                         validate token      │
  │                                         check user session  │
  │                                       ←────  WELCOME        │
  │                                                              │
  │ SYNC (last_known_id, known_hashes)  ──────→                │
  │                                         fetch missing msgs  │
  │                                         pack: base/delta/ref│
  │                                       ←──── PACK binary      │
  │  (decode, resolve deltas locally)                           │
  │  (merge into local state)                                   │
  │  (update CAS cache)                                         │
  │                                                              │
  │ SEND_MESSAGE {content, hash, tag}   ──────→                │
  │  (optimistic render)                         store in CAS   │
  │                                              idempotency ✓  │
  │                                              broad to others │
  │                                            ←──── ACK         │
  │                                                              │
  │ (receive packed broadcasts)         ←──────  PACK binary    │
  │  (decode & render)                                          │
  │  (reconcile with optimistic)                                │
  │                                                              │
  │ PING ──────────────────────────────────→                    │
  │                                    ←─────────── PONG        │
```

---

## 2. TECHNOLOGY STACK

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js 16+ | React 19, SSR, built-in optimization, excellent DX |
| **Frontend State** | React Hooks + Context | Minimal deps, built-in support for async operations |
| **Frontend Storage** | IndexedDB + LocalStorage | Persistent CAS cache, snapshot restoration |
| **Frontend Delta** | diff-match-patch | Proven algorithm, efficient patches, mature library |
| **Backend Runtime** | Node.js 20+ | JavaScript throughout, fast event loop, npm ecosystem |
| **WebSocket** | ws (8.x) | Pure Node.js, low overhead, handles binary frames |
| **REST API** | Express.js 4.18+ | Minimal, flexible, excellent middleware ecosystem |
| **Authentication** | JWT (RS256) + bcrypt | Stateless, scalable, industry standard |
| **Primary DB** | MongoDB 6+ or PostgreSQL 15+ | Document/relational, flexible schema, replication ready |
| **Cache** | Redis 7+ | Distributed cache, rate limiting, session storage |
| **File Storage** | S3/MinIO or Local FS | Scalable, CDN ready, with fallback to local dev |
| **Search** | Elasticsearch 8+ | Production-grade full-text search, aggregations |
| **Message Queue** | Redis Queue or Bull | Background jobs, async processing, retries |
| **Compression** | zlib (built-in) | Standard library, good compression ratio |
| **Containerization** | Docker | Consistent environments, easy deployment |
| **Orchestration** | Docker Compose (dev) / K8s (prod) | Container management at scale |

---

## 3. FOLDER STRUCTURE

### Backend Structure
```
backend/
├── server.js                          # Main entry point (WebSocket server)
├── api.js                             # Express REST API server
├── package.json
├── docker-compose.yml                 # Local dev environment
├── Dockerfile                         # Container definition
│
├── src/
│   ├── auth/
│   │   ├── jwt.js                     # JWT creation, validation, refresh
│   │   ├── password.js                # bcrypt hashing, verification
│   │   └── middleware.js              # Express auth middleware
│   │
│   ├── handlers/
│   │   ├── websocket.js               # WebSocket event handlers
│   │   ├── messages.js                # Message processing logic
│   │   ├── files.js                   # File upload/download handling
│   │   └── sync.js                    # Sync protocol implementation
│   │
│   ├── routes/
│   │   ├── auth.js                    # /api/auth/* routes
│   │   ├── users.js                   # /api/users/* routes
│   │   ├── conversations.js           # /api/conversations/* routes
│   │   ├── messages.js                # /api/messages/* routes
│   │   └── files.js                   # /api/files/* routes
│   │
│   ├── models/
│   │   ├── User.js                    # User schema, methods
│   │   ├── Conversation.js            # Conversation schema
│   │   ├── Message.js                 # Message metadata
│   │   ├── File.js                    # File metadata
│   │   └── index.js                   # DB initialization
│   │
│   ├── services/
│   │   ├── message-store.js           # Content-addressable message store
│   │   ├── delta-encoder.js           # Delta compression logic
│   │   ├── file-service.js            # File operations (upload, resize, cleanup)
│   │   ├── search-service.js          # Full-text search operations
│   │   ├── cache-service.js           # Redis cache operations
│   │   ├── rate-limiter.js            # Distributed rate limiting
│   │   ├── notification-service.js    # Email/push notifications
│   │   └── index.js                   # Service initialization
│   │
│   ├── utils/
│   │   ├── pack-codec.js              # PACK binary encoding/decoding
│   │   ├── hash.js                    # SHA-256 hashing utilities
│   │   ├── validators.js              # Input validation rules
│   │   ├── logger.js                  # Structured logging
│   │   └── constants.js               # Protocol constants
│   │
│   ├── middleware/
│   │   ├── auth.js                    # JWT verification
│   │   ├── validation.js              # Request validation
│   │   ├── cors.js                    # CORS configuration
│   │   ├── rate-limit.js              # Rate limiting middleware
│   │   └── error-handler.js           # Global error handling
│   │
│   └── config/
│       ├── database.js                # DB connection config
│       ├── cache.js                   # Cache client config
│       ├── storage.js                 # File storage config
│       └── constants.js               # App-wide constants
│
├── data/
│   └── chat-store.json                # Persistent message storage (fallback)
│
└── tests/
    ├── auth.test.js
    ├── messages.test.js
    └── integration.test.js
```

### Frontend Structure
```
chat-front/
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with providers
│   │   ├── page.tsx                   # Main chat page
│   │   ├── globals.css                # Global styles
│   │   │
│   │   ├── auth/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── conversations/
│   │   │   ├── [id]/page.tsx          # Conversation detail
│   │   │   ├── new/page.tsx           # Create new conversation
│   │   │   └── layout.tsx
│   │   │
│   │   ├── files/
│   │   │   ├── upload/page.tsx
│   │   │   └── [id]/page.tsx          # File preview
│   │   │
│   │   └── settings/
│   │       ├── profile/page.tsx
│   │       ├── privacy/page.tsx
│   │       └── notifications/page.tsx
│   │
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── MessageList.tsx        # Main message display
│   │   │   ├── MessageItem.tsx        # Single message component
│   │   │   ├── InputBox.tsx           # Message input with attachments
│   │   │   ├── FilePreview.tsx        # Inline file viewer
│   │   │   └── TypingIndicator.tsx    # "User is typing..." UI
│   │   │
│   │   ├── Auth/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   │
│   │   ├── Conversations/
│   │   │   ├── ConversationList.tsx
│   │   │   ├── ConversationItem.tsx
│   │   │   ├── GroupCreator.tsx
│   │   │   └── MemberManager.tsx
│   │   │
│   │   ├── Common/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   │
│   │   └── Search/
│   │       ├── SearchBar.tsx
│   │       ├── SearchResults.tsx
│   │       └── AutoComplete.tsx
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts            # WebSocket connection management
│   │   ├── useAuth.ts                 # Auth context hook
│   │   ├── useMessages.ts             # Message management
│   │   ├── useConversations.ts        # Conversation management
│   │   ├── useFileUpload.ts           # File upload with progress
│   │   ├── useDeltaResolver.ts        # Message delta resolution
│   │   ├── useLocalCache.ts           # IndexedDB cache management
│   │   └── useAutoReconnect.ts        # Exponential backoff reconnection
│   │
│   ├── services/
│   │   ├── api.ts                     # REST API client (axios/fetch)
│   │   ├── websocket-client.ts        # WebSocket connection logic
│   │   ├── pack-decoder.ts            # Binary PACK decoding
│   │   ├── delta-resolver.ts          # Apply deltas to messages
│   │   ├── cache-storage.ts           # IndexedDB operations
│   │   ├── file-handler.ts            # File compression, chunking
│   │   ├── auth-service.ts            # Token management
│   │   └── search-client.ts           # Search API client
│   │
│   ├── context/
│   │   ├── AuthContext.tsx            # Global auth state
│   │   ├── ChatContext.tsx            # Global chat state
│   │   ├── SettingsContext.tsx        # User preferences
│   │   └── NotificationContext.tsx    # Toast/notifications
│   │
│   ├── utils/
│   │   ├── validators.ts              # Input validation
│   │   ├── formatters.ts              # Date, size formatting
│   │   ├── crypto.ts                  # SHA-256 hashing
│   │   ├── logger.ts                  # Client logging
│   │   └── constants.ts               # App constants
│   │
│   └── types/
│       ├── index.ts                   # All TypeScript interfaces
│       └── api.ts                     # API response types
│
├── public/
│   ├── icons/
│   ├── images/
│   └── manifest.json
│
└── tests/
    ├── components/
    └── hooks/
```

---

## 4. DATA MODELS & SCHEMAS

### Message Model (Content-Addressable)
```typescript
// In-memory and persisted structure
{
  id: string;                           // SHA-256(content + metadata)
  type: 'base' | 'delta' | 'reference'; // Compression strategy
  content: string;                      // Full text for 'base' type
  delta: string;                        // Diff patches for 'delta' type
  base_id: string | null;               // Reference to base message
  resolved_content: string;             // Materialized content (cache)
  timestamp: number;                    // Message creation epoch
  sequence: number;                     // Monotonic per-conversation
  sender_id: string;                    // User ID of sender
  conversation_id: string;              // Which conversation
  client_tag: string;                   // Idempotency key (optional)
  stream_id: string;                    // For streaming/chunked messages
  chunk_index: number;                  // Position in stream
  total_chunks: number;                 // Total parts
  is_final: boolean;                    // Last chunk?
  
  // Optional metadata
  mentions: string[];                   // @user references
  edited_timestamp?: number;            // When last edited
  edited_count?: number;                // How many edits
  deleted_at?: number;                  // Soft delete timestamp
  file_ids?: string[];                  // Attached files
  reply_to?: string;                    // Message ID being replied to
  
  // Internal fields
  resolved_content: string;             // Cache of materialized content
}

// Database representation (MongoDB example)
db.messages.createIndex({ conversation_id: 1, sequence: 1 })
db.messages.createIndex({ sender_id: 1, timestamp: -1 })
db.messages.createIndex({ id: 1 }, { unique: true })
```

### User Model
```typescript
{
  _id: string;                          // UUID or email hash
  email: string;                        // Unique, indexed
  username: string;                     // Display name, unique
  password_hash: string;                // bcrypt(password)
  avatar_url: string;                   // Profile picture
  status: 'online' | 'away' | 'offline';
  status_message: string;               // Custom status
  
  created_at: number;                   // Registration timestamp
  last_seen: number;                    // Last activity
  
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications_enabled: boolean;
    email_notifications: boolean;
    blocked_users: string[];            // User IDs
  };
  
  // Relations
  conversations: string[];              // Conversation IDs
  friends: string[];                    // Friend user IDs
  friend_requests: {
    sent: string[];                     // Pending outgoing
    received: string[];                 // Pending incoming
  };
}

// Database indexes
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })
db.users.createIndex({ last_seen: -1 })
```

### Conversation Model
```typescript
{
  _id: string;                          // UUID
  type: 'direct' | 'group';             // 1-to-1 or group chat
  name: string;                         // Group name or empty
  description: string;                  // Group description
  avatar_url: string;                   // Group picture
  
  members: {
    user_id: string;
    joined_at: number;
    role: 'owner' | 'admin' | 'member';
    muted: boolean;
  }[];
  
  created_at: number;
  created_by: string;
  last_message_id: string;
  last_message_at: number;
  
  // Synchronization
  ordered_ids: string[];                // Sequence of message IDs
  next_sequence: number;                // Next seq number to assign
  stream_heads: Map<string, string>;    // stream_id -> latest message_id
  
  // Settings
  pinned_messages: string[];            // Pinned message IDs
  archived: boolean;
  encryption: 'none' | 'e2e';          // Future expansion
}

// Database indexes
db.conversations.createIndex({ members.user_id: 1 })
db.conversations.createIndex({ last_message_at: -1 })
```

### File Metadata Model
```typescript
{
  _id: string;                          // UUID
  conversation_id: string;
  message_id: string;                   // Which message carries this
  uploaded_by: string;                  // User ID
  original_filename: string;
  mime_type: string;                    // e.g., 'image/jpeg'
  size_bytes: number;
  
  // Storage paths
  storage_path: string;                 // S3 key or local path
  storage_type: 'local' | 's3' | 'gcs';
  
  // Processing
  processing_status: 'pending' | 'ready' | 'failed';
  error: string | null;                 // If failed
  
  // Variants
  variants: {
    type: 'original' | 'thumbnail' | 'preview' | 'compressed';
    mime_type: string;
    size_bytes: number;
    path: string;
    dimensions: { width: number; height: number }; // For images
  }[];
  
  // Preview data
  preview: {
    type: 'image' | 'pdf' | 'document' | 'video' | 'unknown';
    thumbnail_path: string;
    extracted_text?: string;            // For PDFs, documents
    duration_ms?: number;               // For videos
  };
  
  created_at: number;
  expires_at: number | null;            // Auto-delete date
  access_token: string;                 // For direct access
}
```

---

## 5. COMMUNICATION PROTOCOLS

### PACK Binary Protocol (v1)

**Format**: `[PACK Header] + [Entries] + [SHA-256 Checksum]`

**After Compression**: `DEFLATE(above) + 32-byte checksum`

```
PACK HEADER (16 bytes)
┌─────────────────────────────────┐
│ Magic: "PACK" (4 bytes)         │
│ Version: u16 (2 bytes) = 1      │
│ Codec: u8 (1 byte) = 1 (zlib)   │
│ Reserved: u8 (1 byte) = 0       │
│ Entry count: u32 (4 bytes)      │
│ Payload length: u32 (4 bytes)   │
└─────────────────────────────────┘

ENTRY (variable length)
┌──────────────────────────────────────┐
│ Type: u8 (0=base, 1=delta, 2=ref)   │
│ Flags: u8 (bit 0: is_final)         │
│ ID: [32 bytes] SHA-256              │
│ Base ID: [32 bytes] (zeros if none) │
│ Timestamp: i64                       │
│ Sequence: i64                        │
│ Chunk index: u32                    │
│ Total chunks: u32                   │
│ Sender len: u16                     │
│ Conversation len: u16               │
│ Client tag len: u16                 │
│ Stream ID len: u16                  │
│ Payload len: u32                    │
│ [sender bytes]                       │
│ [conversation bytes]                │
│ [client_tag bytes]                  │
│ [stream_id bytes]                   │
│ [payload bytes]                     │
└──────────────────────────────────────┘

CHECKSUM (32 bytes)
└─ SHA-256(uncompressed content)
```

**Compression Efficiency**:
- Base message (typical): ~150 bytes content → 200+ bytes overhead = 350 bytes (uncompressed)
  - After PACK encoding + zlib: ~120 bytes (65% reduction)
- Delta message: 50-byte patch → 150 bytes overhead = 200 bytes (uncompressed)
  - After PACK encoding + zlib: ~60 bytes (70% reduction)
- Reference (already cached): ~130 bytes overhead
  - After PACK encoding + zlib: ~45 bytes (65% reduction)

### WebSocket Control Frames (JSON)

```typescript
// CLIENT → SERVER

// 1. Initial handshake
{
  type: 'hello',
  token: 'Bearer <JWT>',
  user_id: 'user123',
  conversation_id: 'conv-456',
  last_known_message_id: 'abc123...',
  known_object_ids: ['hash1', 'hash2', ...]  // Last 128
}

// 2. Sync request (after reconnection or gaps)
{
  type: 'sync',
  conversation_id: 'conv-456',
  last_known_message_id: 'abc123...',
  known_object_ids: [...]
}

// 3. Send message
{
  type: 'send_message',
  content: 'Hello, world!',
  timestamp: 1704067200000,
  sender_id: 'user123',
  conversation_id: 'conv-456',
  message_id: 'hash...',                      // Client-computed SHA-256
  client_tag: 'uuid-1234',                    // For idempotency
  stream_id: 'stream-uuid',                   // For multi-part messages
  chunk_index: 0,
  total_chunks: 1,
  is_final: true,
  reply_to_id: 'parent-msg-id',               // Optional
  request_demo_stream: false                  // For testing
}

// 4. Heartbeat/keepalive
{
  type: 'pong',
  ts: 1704067200000
}

// 5. Mark as read
{
  type: 'mark_read',
  conversation_id: 'conv-456',
  message_id: 'hash...'
}

// SERVER → CLIENT

// 1. Server acknowledgment
{
  type: 'welcome',
  user_id: 'user123',
  conversation_id: 'conv-456',
  heartbeat_ms: 30000,
  pack_version: 1,
  compression: 'zlib'
}

// 2. Message acknowledgment
{
  type: 'ack',
  client_tag: 'uuid-1234',
  message_id: 'hash...',                      // Computed by server
  sequence: 42,                               // Assigned sequence
  deduplicated: false,
  stored_as: 'base' | 'delta' | 'reference'
}

// 3. Negative acknowledgment
{
  type: 'nack',
  code: 'validation_failed' | 'unauthorized' | 'rate_limited' | 'duplicate',
  message: 'Human readable error'
}

// 4. Pack file notification
{
  type: 'pack_sent',
  reason: 'sync' | 'broadcast' | 'delta_update',
  entries: 5,
  bytes: 1024
}

// 5. Server initiates sync
{
  type: 'ping',
  ts: 1704067200000
}

// 6. Sync completion
{
  type: 'sync_complete',
  conversation_id: 'conv-456',
  count: 10                                   // Messages sent
}
```

---

## 6. KEY ALGORITHMS & LOGIC

### A. Delta Compression Algorithm

```javascript
// Pseudocode for delta-based message storage

function selectDeltaBase(conversation, newMessage) {
  // 1. Check stream heads (if part of streaming message)
  if (newMessage.stream_id && conversation.streamHeads.has(newMessage.stream_id)) {
    return messageStore.get(conversation.streamHeads.get(newMessage.stream_id))
  }
  
  // 2. Walk recent messages backward
  for (let i = conversation.orderedIds.length - 1; i >= 0; i--) {
    const candidate = messageStore.get(conversation.orderedIds[i])
    if (!candidate) continue
    
    const baseContent = materializeContent(candidate)
    if (!baseContent) continue
    
    // Prefer same sender or similar size
    const sameSender = candidate.sender_id === newMessage.sender_id
    const similarSize = Math.abs(baseContent.length - newMessage.content.length) <= 512
    
    if (sameSender || similarSize) {
      return candidate
    }
    
    // Stop searching after 8 messages
    if (conversation.orderedIds.length - i > 8) break
  }
  
  return null
}

function shouldUseDelta(baseMessage, deltaText, contentSize) {
  if (!baseMessage) return false
  if (!deltaText || !deltaText.length) return false
  if (getDeltaChainDepth(baseMessage.id) >= MAX_DELTA_CHAIN) return false
  
  // Delta is more efficient if: deltaBytes + overhead < content * 0.88
  const deltaBytes = Buffer.byteLength(deltaText)
  const contentBytes = Buffer.byteLength(content)
  
  return deltaBytes + 48 < contentBytes * 0.88
}

// Materialization: resolve delta chains to full content
function materializeContent(message) {
  if (message.resolved_content) return message.resolved_content
  
  if (message.type === 'base') {
    return message.content
  }
  
  if (message.type === 'delta' && message.base_id) {
    const baseMsg = messageStore.get(message.base_id)
    const baseContent = materializeContent(baseMsg)  // Recursive
    const patches = diffMatchPatch.patch_fromText(message.delta)
    const [result] = diffMatchPatch.patch_apply(patches, baseContent)
    return result
  }
  
  return ''
}
```

### B. Idempotency & Replay Guard

```javascript
// Prevent duplicate message processing

const replayGuards = new Map()  // userId -> Map<clientTag, messageId>

function rememberReplayKey(userId, clientTag, messageId) {
  if (!clientTag) return { ok: true }  // No tag = can't deduplicate
  
  if (!replayGuards.has(userId)) {
    replayGuards.set(userId, new Map())
  }
  
  const guard = replayGuards.get(userId)
  const existing = guard.get(clientTag)
  
  if (existing && existing !== messageId) {
    // Replay detected: same client_tag, different payload
    return { ok: false, reason: 'client_tag reused for different payload' }
  }
  
  // Record this tag → messageId mapping
  guard.delete(clientTag)
  guard.set(clientTag, messageId)
  
  // Keep only last 256 tags per user
  while (guard.size > MAX_REPLAY_KEYS_PER_USER) {
    const oldestKey = guard.keys().next().value
    guard.delete(oldestKey)
  }
  
  return { ok: true, isDuplicate: !!existing }
}

// Client generates immutable hash
function computeMessageId(content, metadata) {
  const payload = JSON.stringify({
    content,
    timestamp: metadata.timestamp,
    sender_id: metadata.sender_id,
    conversation_id: metadata.conversation_id,
    client_tag: metadata.client_tag || '',
    stream_id: metadata.stream_id || '',
  })
  
  return sha256(payload)  // Deterministic!
}

// If client retransmits with same content + client_tag:
// - Server sees same message_id hash
// - Stores once, returns same ACK
// - Client deduplicates in UI
```

### C. Sync Protocol (Git-style Incremental Sync)

```javascript
// Client knows last 128 messages by hash
// Server computes missing messages

function getMissingMessages(conversationId, lastKnownMessageId) {
  const conversation = conversationStore.get(conversationId)
  if (!lastKnownMessageId) {
    // Cold start: send all (or last N)
    return conversation.orderedIds
      .map(id => messageStore.get(id))
      .filter(Boolean)
      .slice(-1000)  // Limit to last 1000
  }
  
  // Find index of last known
  const index = conversation.orderedIds.indexOf(lastKnownMessageId)
  if (index < 0) {
    // Client hash not found: probably old or wrong conversation
    // Start from a recent point
    return conversation.orderedIds
      .slice(-500)
      .map(id => messageStore.get(id))
      .filter(Boolean)
  }
  
  // Return everything after last known
  return conversation.orderedIds
    .slice(index + 1)
    .map(id => messageStore.get(id))
    .filter(Boolean)
}

// Send in batches with reference optimization
function sendPack(ws, messages, reason) {
  const state = clientState.get(ws)
  if (!state || !messages.length) return
  
  const entries = messages.map(msg => {
    // Already have this? Send as 'reference' (just the hash)
    if (state.knownObjects.has(msg.id)) {
      return {
        ...msg,
        type: 'reference',
        content: '',
        delta: '',
        base_id: null,
      }
    }
    
    // Apply delta optimization if possible
    if (msg.type === 'delta' && 
        msg.base_id && 
        state.knownObjects.has(msg.base_id)) {
      return msg  // Send as-is, client can resolve
    }
    
    // Send full content
    return {
      ...msg,
      type: 'base',
      content: materializeContent(msg),
      delta: '',
      base_id: null,
    }
  })
  
  const packet = buildPackfile(entries)
  ws.send(packet, { binary: true }, (error) => {
    if (!error) {
      entries.forEach(e => state.knownObjects.add(e.id))
    }
  })
}
```

### D. Conflict Resolution & Causal Ordering

```javascript
// Messages are ordered by (sequence, timestamp) not just timestamp
// Sequence is monotonic per-conversation, assigned by server

function sortMessages(left, right) {
  // Server sequence is source of truth
  const leftOrder = left.sequence > 0 ? left.sequence : left.timestamp
  const rightOrder = right.sequence > 0 ? right.sequence : right.timestamp
  
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }
  
  // Tiebreaker: timestamp for messages in same batch
  return left.timestamp - right.timestamp
}

// Stream-based ordering (for multi-part messages, chat streams)
function handleStream(conversationId, incomingMessage) {
  const stream = streamStore.get(incomingMessage.stream_id)
  if (!stream) {
    streamStore.set(incomingMessage.stream_id, {
      parts: new Map(),
      createdAt: Date.now(),
    })
  }
  
  const stream = streamStore.get(incomingMessage.stream_id)
  
  // Store chunk
  stream.parts.set(incomingMessage.chunk_index, incomingMessage)
  
  // All chunks received?
  if (stream.parts.size === incomingMessage.total_chunks) {
    // Reassemble
    const content = Array.from(Array(incomingMessage.total_chunks).keys())
      .map(i => stream.parts.get(i).resolved_content)
      .join('')
    
    // Create final message
    const finalMessage = {
      ...incomingMessage,
      content,
      is_final: true,
    }
    
    // Process as single message
    storeIncomingMessage(finalMessage)
    streamStore.delete(incomingMessage.stream_id)
  }
}
```

---

## 7. PERFORMANCE OPTIMIZATION STRATEGIES

### Bandwidth Optimization

| Technique | Savings | Implementation |
|-----------|---------|-----------------|
| **Delta Compression** | 60-80% for edits | diff-match-patch patches |
| **Reference Messages** | 95% for cached | Just send hash if client has it |
| **PACK Binary** | 40-50% vs JSON | Custom codec + zlib |
| **Pagination** | N/A | Load 50 messages, lazy-load more |
| **Chunking** | N/A | Split large files into 1MB chunks |
| **Image Optimization** | 75-85% | WebP thumbnails (48x48, 256x256) |
| **Message Batching** | 30% | Collect 12ms worth of messages before broadcast |

### Client-Side Optimization

| Technique | Benefit |
|-----------|---------|
| **Optimistic Updates** | Perceived latency = 0ms |
| **IndexedDB Cache** | Instant message access, offline support |
| **Lazy Loading** | Only render visible messages |
| **Virtual Scrolling** | Smooth scroll with 10k+ messages |
| **Deferred Rendering** | Heavy computations don't block UI |
| **Request Deduplication** | Single request for same resource |
| **Local Snapshot** | Restore conversation state instantly |

### Server-Side Optimization

| Technique | Benefit |
|-----------|---------|
| **Broadcast Batching** | Reduce bandwidth 30% via message coalescence |
| **Stream Heads Cache** | O(1) stream tail lookup vs O(n) iteration |
| **Content-Addressable Store** | Automatic deduplication by hash |
| **Message Materialization Cache** | Don't recompute deltas repeatedly |
| **Distributed Rate Limiting** | Redis-backed, scales across instances |
| **Connection Pooling** | Reuse database connections |
| **Async File Processing** | Don't block main thread on uploads |

---

## 8. SECURITY ARCHITECTURE

### Authentication Flow
```
User                    Frontend                 Backend
  │                        │                         │
  ├─ Enter credentials ──→  │                         │
  │                        │  POST /api/auth/login   │
  │                        ├────────────────────────→│
  │                        │  (email, password)      │
  │                        │                    bcrypt verify
  │                        │                    generate JWT (RS256)
  │                        │ ←────── access + refresh tokens
  │                        │  Set secure cookie      │
  │                        ├─ Store in secure store  │
  │                        │                         │
  │                        │  GET /api/users/me      │
  │                        ├────────────────────────→│
  │                        │  (Bearer <access_jwt>)  │
  │                        │ ←──── user profile      │
  │                        ├─ Render authenticated   │
  │                        │                         │
  │  WebSocket connect ────│ Connect ws://:8080      │
  │                        │├────────────────────────→│
  │                        │ {hello, token}          │
  │                        │  (same JWT)             │
  │                        │ ←─── {welcome}          │
  │                        ├─ Authenticate          │
```

### Token Strategy
- **Access Token**: RS256 JWT, 15-minute expiry, stored in memory
- **Refresh Token**: RS256 JWT, 7-day expiry, httpOnly + Secure cookie
- **WebSocket Auth**: Use access token, automatically refresh before expiry
- **Logout**: Invalidate refresh token, clear cookies, redirect to /login

### Authorization Model
```javascript
// Role-based access control (RBAC)
const roles = {
  'owner': {
    canDeleteConversation: true,
    canRemoveMembers: true,
    canChangeSettings: true,
    canDeleteMessages: true,
    canViewAnalytics: true,
  },
  'admin': {
    canDeleteConversation: false,
    canRemoveMembers: true,
    canChangeSettings: false,
    canDeleteMessages: true,
    canViewAnalytics: false,
  },
  'member': {
    canDeleteConversation: false,
    canRemoveMembers: false,
    canChangeSettings: false,
    canDeleteMessages: false,  // Only own messages
    canViewAnalytics: false,
  },
}

// Middleware example
function requirePermission(permission) {
  return async (req, res, next) => {
    const user = req.user  // From JWT middleware
    const conversation = await Conversation.findById(req.params.conversationId)
    const member = conversation.members.find(m => m.user_id === user._id)
    
    if (!member) return res.status(403).json({ error: 'Not a member' })
    
    const role = roles[member.role]
    if (!role[permission]) {
      return res.status(403).json({ error: 'Permission denied' })
    }
    
    next()
  }
}
```

### Data Encryption
```javascript
// Sensitive data at rest
const crypto = require('crypto')

function encryptField(value, encryptionKey) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  }
}

function decryptField(encrypted, encryptionKey) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(encryptionKey, 'hex'),
    Buffer.from(encrypted.iv, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'hex')),
    decipher.final(),
  ])
  
  return JSON.parse(decrypted.toString('utf8'))
}

// Encrypt: phone_number, social_security, payment_methods
// Don't encrypt: public profile, conversation members
```

---

## 9. DEPLOYMENT & SCALING

### Horizontal Scaling Architecture

```
                          DNS (Route 53/CloudFlare)
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
         ┌──────────▼────────┐ ┌───▼──────────────┐ ┌───▼──────────────┐
         │ Load Balancer 1   │ │ Load Balancer 2  │ │ Load Balancer 3  │
         │ (WebSocket → ws0) │ │ (REST → api0)    │ │ (REST → api1)    │
         └───────┬────┬──────┘ └────┬──────┬──────┘ └────┬──────┬──────┘
                 │    │             │      │             │      │
        ┌────────▼────▼─────┐ ┌─────▼──────▼─────┐ ┌────▼──────▼──────┐
        │ WS Server Cluster │ │ API Server Nodes │ │ Worker/Cron Pod  │
        │ (3-10 instances)  │ │ (3-10 instances) │ │ (1-3 instances)  │
        │  ws0, ws1, ws2    │ │ api0, api1, api2 │ │ worker0, cron    │
        └────┬──────────────┘ └──────┬───────────┘ └────┬─────────────┘
             │                       │                   │
             └───────┬───────────────┼───────────────────┘
                     │
        ┌────────────▼────────────────────────┐
        │    Shared Cache Layer (Redis)       │
        │  - Session tokens                   │
        │  - Rate limit buckets               │
        │  - Conversation mute states         │
        │  - User presence (online/offline)   │
        └────────────┬───────────────────────┘
                     │
        ┌────────────▼────────────────────────┐
        │      Primary Database               │
        │  - MongoDB replica set (3 nodes)    │
        │  - Or PostgreSQL with HA            │
        │  - Automated backups to S3          │
        └────────────┬───────────────────────┘
                     │
        ┌────────────▼────────────────────────┐
        │    Object Storage (S3/MinIO)        │
        │  - Original files                   │
        │  - Processed variants               │
        │  - Backups                          │
        │  - CloudFront CDN for delivery      │
        └─────────────────────────────────────┘
```

### Docker Deployment

```dockerfile
# Dockerfile for backend
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY data ./data

EXPOSE 3000 8080

CMD ["node", "api.js"]  # Or use supervisord for multi-process
```

```yaml
# docker-compose.yml for local development
version: '3.8'

services:
  backend-api:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - MONGO_URI=mongodb://mongo:27017/chat
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=dev-secret-key
      - FILE_STORAGE=local
    depends_on:
      - mongo
      - redis
    volumes:
      - ./backend/src:/app/src
      - ./backend/data:/app/data

  backend-ws:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=development
      - PORT=8080
      - MONGO_URI=mongodb://mongo:27017/chat
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=dev-secret-key
    depends_on:
      - mongo
      - redis

  frontend:
    build: ./chat-front
    ports:
      - "3001:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3000
      - NEXT_PUBLIC_WS_URL=ws://localhost:8080
    depends_on:
      - backend-api

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=chat

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  mongo_data:
```

---

## 10. MONITORING & OBSERVABILITY

### Key Metrics to Track

```javascript
// Backend metrics
{
  // WebSocket metrics
  ws_connections_active: gauge,          // Current connections
  ws_messages_per_second: counter,       // Throughput
  ws_pack_size_bytes: histogram,         // Pack payload sizes
  ws_decode_errors: counter,             // Parse failures
  ws_reconnection_rate: gauge,           // Client stability
  
  // Message processing
  message_store_size: gauge,             // Total messages
  message_delta_ratio: gauge,            // % of delta vs base
  message_dedup_hits: counter,           // Replay guard hits
  message_latency_p99: histogram,        // Server processing time
  
  // Database
  db_query_latency_p95: histogram,
  db_connection_pool_usage: gauge,
  db_write_throughput: counter,
  
  // File uploads
  file_upload_size_bytes: histogram,
  file_processing_latency: histogram,
  file_storage_usage_bytes: gauge,
  
  // API
  http_request_duration_seconds: histogram,
  http_requests_total: counter,
  http_errors_5xx: counter,
  
  // Business metrics
  active_users: gauge,
  conversations_created_daily: counter,
  messages_sent_daily: counter,
  
  // System
  process_memory_bytes: gauge,
  process_cpu_seconds_total: counter,
  nodejs_event_loop_lag_seconds: gauge,
}

// Prometheus scrape config
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'websocket-servers'
    static_configs:
      - targets: ['ws0:9090', 'ws1:9090', 'ws2:9090']
  - job_name: 'api-servers'
    static_configs:
      - targets: ['api0:9090', 'api1:9090', 'api2:9090']
```

### Logging Strategy

```javascript
// Structured logging with Winston
const logger = require('winston')

logger.configure({
  format: logger.format.combine(
    logger.format.timestamp(),
    logger.format.json(),
  ),
  defaultMeta: { service: 'chat-backend' },
  transports: [
    new logger.transports.File({ filename: 'error.log', level: 'error' }),
    new logger.transports.File({ filename: 'combined.log' }),
    new logger.transports.Console({
      format: logger.format.simple(),
    }),
  ],
})

// Usage
logger.info('User logged in', {
  userId: user.id,
  timestamp: Date.now(),
  ipAddress: req.ip,
})

logger.error('Message processing failed', {
  error: error.message,
  conversationId: convId,
  messageId: msgId,
  stack: error.stack,
})
```

---

## 11. TESTING STRATEGY

### Unit Tests
- Auth/JWT functions
- Delta compression/resolution
- Hash computations
- Validation functions

### Integration Tests
- WebSocket handshake + auth
- Full message flow (send → broadcast → receive)
- Sync protocol (missing messages)
- File upload → processing → deletion

### Load Testing
```bash
# Using autocannon or k6
npx autocannon ws://localhost:8080 \
  --requests=1000 \
  --connections=100 \
  --duration=60
```

### Chaos Testing
- Kill random server instances
- Introduce network delays
- Simulate database failures
- Truncate Redis cache

---

## 12. FUTURE ENHANCEMENTS

- **End-to-End Encryption (E2E)**: Signal protocol, per-conversation keys
- **Video/Audio Calling**: WebRTC signaling layer, TURN servers
- **Message Reactions**: Emoji reactions, aggregated counts
- **Typing Indicators**: Real-time "user is typing" notifications
- **Read Receipts**: Track message delivery & read status
- **Voice Messages**: Opus codec, streaming audio
- **GeoIP-based Routing**: Route to nearest server cluster
- **Multi-language Support**: i18n framework, translation API
- **Mobile Apps**: React Native for iOS/Android
- **Marketplace**: Plugin system for bots, integrations (Slack, GitHub, etc.)

---

## Summary

This architecture is **production-ready, horizontally scalable, and performant**:

✅ **Bandwidth Optimized**: PACK binary, delta compression, reference messages  
✅ **High Availability**: Stateless servers, Redis cache, database replication  
✅ **Security First**: JWT auth, bcrypt passwords, encryption at rest  
✅ **Observable**: Prometheus metrics, structured logging, performance tracking  
✅ **Resilient**: Exponential backoff reconnection, idempotency, replay guards  
✅ **Scalable**: Horizontal pod autoscaling, sharded database, distributed cache  

Deploy with confidence! 🚀