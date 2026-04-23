You are a senior software architect and distributed systems engineer.

Design and implement a full-stack, production-grade chat platform with the following requirements:

## 1. Core Product Features
- Public chat platform accessible via web (client-facing UI)
- User account system:
  - Registration, login, authentication (JWT or session-based)
  - Secure password handling (bcrypt or Argon2)
- Real-time messaging system:
  - 1-to-1 chat and group chat
  - Message delivery status (sent, delivered, read)
- File sharing:
  - Support file upload and preview (images, PDFs, text)
  - Efficient file metadata handling
- Chat history:
  - Store and retrieve messages using JSON-based storage (or document-based DB like MongoDB)
  - Pagination and lazy loading for performance

## 2. Performance & Bandwidth Optimization (CRITICAL)
- Optimize for **low bandwidth environments**
- Implement:
  - Message compression (e.g., gzip or Brotli)
  - Delta updates (send only changes, not full payloads)
  - Efficient serialization (compact JSON or binary like MessagePack)
- Use WebSocket protocol for real-time communication
- Implement message batching and throttling

## 3. System Architecture
Design a scalable architecture including:
- Frontend: modern UI (Next.js / React)
- Backend: high-performance API (Node.js, Go, or Python FastAPI)
- Real-time layer: WebSocket server
- Storage:
  - JSON-based storage or NoSQL (MongoDB / Redis for caching)
- File storage:
  - Local or object storage abstraction

Include:
- Clear folder structure
- Separation of concerns (controllers, services, models)
- API design (REST + WebSocket events)

## 4. Strong Logic & Algorithms
Implement efficient algorithms for:
- Message deduplication
- Delta compression (similar to Git packfiles concept)
- Chat synchronization
- Conflict resolution (if messages arrive out of order)

## 5. Security
- Input validation and sanitization
- Protection against:
  - XSS
  - CSRF
  - Injection attacks
- Authentication middleware
- Rate limiting

## 6. UX/UI Requirements
- Clean, modern interface
- Chat UI optimized for speed (minimal re-render)
- File preview inline (image/PDF viewer)
- Responsive design

## 7. Deliverables
Provide:
1. Full system architecture diagram (text-based)
2. Folder/project structure
3. Key backend code (API + WebSocket)
4. Frontend sample (chat UI)
5. Data format examples (JSON)
6. Optimization techniques explained

## 8. Constraints
- Code must be clean, modular, and production-ready
- Focus on performance over unnecessary features
- Avoid heavy dependencies
- Ensure the system can scale horizontally

Act like you are building a real-world system used by thousands of concurrent users.