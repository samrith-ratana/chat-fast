You are a senior distributed systems engineer and real-time communication architect.

Your task is to design and implement a high-performance chat service that mimics Git’s data transfer efficiency model (packfiles, delta compression, deduplication), optimized for near-zero perceived latency.

---

# 🎯 OBJECTIVE

Build a chat system with:
- Near 0ms perceived latency (via optimistic UI)
- Efficient bandwidth usage (Git-like packfiles)
- Scalable architecture (multi-tenant, horizontally scalable)
- Real-time bidirectional communication

---

# 🧠 CORE CONCEPTS (MUST IMPLEMENT)

## 1. Content-Addressable Storage
- Each message must be hashed:
  message_id = SHA-256(content + metadata)
- Avoid duplicate storage using hash identity

---

## 2. Message Object Model
Design message objects similar to Git blobs:

{
  id: hash,
  type: "base" | "delta" | "reference",
  content: string (optional),
  base_id: hash (for delta),
  delta: binary diff (for delta),
  timestamp: int,
  sender_id: string,
  conversation_id: string
}

---

## 3. Packfile Protocol (CRITICAL)
Design a binary protocol similar to Git packfiles:

PACKFILE:
- header:
    version
    message_count
- entries:
    [message_object...]
- compression: zlib or zstd
- checksum

Explain:
- How messages are grouped
- How delta chains are handled
- How decoding works on client

---

## 4. Delta Compression
Implement diff-based message transfer:
- Use diff-match-patch OR rolling hash
- Only send differences between messages
- Optimize for:
    - message edits
    - repeated prefixes (chat threads)
    - AI streaming responses

---

## 5. Deduplication
- Maintain cache:
    hash → message
- If already exists:
    send reference instead of full content

---

## 6. Transport Layer
Use:
- WebSocket (primary)
- Optional: HTTP/3 (QUIC)

Define:
- Connection lifecycle
- Heartbeats / keepalive
- Reconnect strategy

---

## 7. Sync Protocol (Git-like Negotiation)

Client sends:
{
  last_known_message_id
}

Server responds:
- Only missing messages
- Packed + compressed

---

## 8. Optimistic UI (0ms illusion)
- Messages appear instantly on client
- Server confirms asynchronously
- Handle:
    - failure rollback
    - message reconciliation

---

## 9. Streaming Support
For large/AI messages:
- Chunk messages
- Stream partial deltas
- Reconstruct progressively

---

# 🏗️ SYSTEM ARCHITECTURE

Design full architecture:

Frontend:
- Local cache (hash map)
- Delta decoder
- WebSocket client

Backend:
- API Gateway
- WebSocket server
- Packfile builder
- Delta engine
- Message broker (Kafka / Redis streams)
- Storage:
    - Redis (hot)
    - Object store (S3)

---

# ⚙️ IMPLEMENTATION REQUIREMENTS

Provide:

## Backend (choose one: Node.js or Go)
- WebSocket server
- Message pack builder
- Compression integration
- Delta encoding module

## Frontend (React or Next.js)
- WebSocket client
- Optimistic UI
- Delta decoding logic
- Local cache

---

# 🔄 DATA FLOW (EXPLAIN STEP-BY-STEP)

1. User sends message
2. Client hashes + displays instantly
3. Server receives and:
   - checks dedup
   - builds packfile
4. Server broadcasts compressed data
5. Clients decode + update UI

---

# 📊 PERFORMANCE OPTIMIZATION

Explain:
- Why packfiles reduce bandwidth
- How delta compression reduces payload
- How WebSocket reduces latency
- Expected latency breakdown

---

# 🔐 SECURITY

Include:
- TLS (WSS)
- Message integrity (hash validation)
- Authentication (JWT or session)
- Replay protection

---

# 🧪 BONUS (ADVANCED)

Include:
- CRDT or OT for conflict resolution
- Multi-device sync
- Offline-first support
- Edge deployment (CDN + regional servers)

---

# 📦 OUTPUT FORMAT

Provide:

1. Architecture diagram (text-based)
2. Protocol specification
3. Code snippets (backend + frontend)
4. Example message flow
5. Performance explanation
6. Scaling strategy

---

Be precise, technical, and production-oriented.
Avoid generic explanations.
Focus on real-world system design and implementation.