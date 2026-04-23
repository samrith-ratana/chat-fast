# API And Protocol Reference

Base URL: `http://localhost:8080`

## REST Endpoints

### Auth

`POST /api/auth/register`

```json
{
  "email": "sam@example.com",
  "username": "sam",
  "password": "StrongPass123!"
}
```

`POST /api/auth/login`

```json
{
  "email": "sam@example.com",
  "password": "StrongPass123!"
}
```

`POST /api/auth/refresh`

```json
{
  "refreshToken": "<jwt>"
}
```

### Conversations

`GET /api/conversations`

`POST /api/conversations`

```json
{
  "type": "group",
  "name": "Platform Team",
  "member_ids": [
    "ops-bot@system.local",
    "sam@example.com"
  ]
}
```

`GET /api/conversations/:conversationId/messages?limit=30&before=120`

Response:

```json
{
  "messages": [
    {
      "id": "sha256",
      "conversation_id": "room-launchpad",
      "sender_id": "sam@example.com",
      "content": "Ship it.",
      "timestamp": 1760000000000,
      "sequence": 144,
      "client_tag": "uuid",
      "stream_id": "",
      "chunk_index": 0,
      "total_chunks": 1,
      "is_final": true,
      "stored_as": "base",
      "attachments": [],
      "delivery": {
        "sent_at": 1760000000000,
        "delivered_to": {
          "sam@example.com": 1760000000000
        },
        "read_by": {
          "sam@example.com": 1760000000000
        }
      }
    }
  ],
  "next_cursor": 114,
  "has_more": true
}
```

`POST /api/conversations/:conversationId/read`

```json
{
  "up_to_sequence": 144
}
```

### Files

`POST /api/files/upload`

- `multipart/form-data`
- fields:
  - `conversation_id`
  - `file`

Response:

```json
{
  "_id": "file-uuid",
  "conversation_id": "room-launchpad",
  "filename": "diagram.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 248103,
  "preview": {
    "type": "pdf",
    "inline_url": "/api/files/file-uuid/content?token=abc123"
  },
  "download_url": "/api/files/file-uuid/content?token=abc123",
  "access_token": "abc123"
}
```

## WebSocket

URL: `ws://localhost:8080`

### Client → Server

Handshake:

```json
{
  "type": "hello",
  "token": "<access-jwt>",
  "user_id": "sam@example.com",
  "conversation_id": "room-launchpad",
  "last_known_message_id": "optional-message-id",
  "known_object_ids": ["sha256-a", "sha256-b"]
}
```

Send message:

```json
{
  "type": "send_message",
  "content": "Upload is live.",
  "timestamp": 1760000000000,
  "sender_id": "sam@example.com",
  "conversation_id": "room-launchpad",
  "message_id": "sha256",
  "client_tag": "uuid",
  "attachments": [
    {
      "file_id": "file-uuid"
    }
  ]
}
```

Sync:

```json
{
  "type": "sync",
  "conversation_id": "room-launchpad",
  "last_known_message_id": "sha256",
  "known_object_ids": ["sha256-a", "sha256-b"]
}
```

### Server → Client Control Frames

Welcome:

```json
{
  "type": "welcome",
  "user_id": "sam@example.com",
  "conversation_id": "room-launchpad",
  "heartbeat_ms": 15000,
  "pack_version": 1,
  "compression": "zlib"
}
```

Ack:

```json
{
  "type": "ack",
  "client_tag": "uuid",
  "message_id": "sha256",
  "sequence": 145,
  "deduplicated": false,
  "stored_as": "delta"
}
```

Receipt update:

```json
{
  "type": "receipt_update",
  "conversation_id": "room-launchpad",
  "updates": [
    {
      "message_id": "sha256",
      "sequence": 145,
      "delivered_to": {
        "ops-bot@system.local": 1760000000050
      },
      "read_by": {
        "ops-bot@system.local": 1760000001100
      }
    }
  ]
}
```

## `PACK` Payload Format

Uncompressed header:

- magic: 4 bytes (`PACK`)
- version: `u16`
- codec: `u8`
- reserved: `u8`
- entry_count: `u32`
- payload_length: `u32`

Entry layout:

- type: `u8` (`0=base`, `1=delta`, `2=reference`)
- flags: `u8`
- id: 32 bytes
- base_id: 32 bytes
- timestamp: `u64`
- sequence: `u64`
- chunk_index: `u32`
- total_chunks: `u32`
- sender_len: `u16`
- conversation_len: `u16`
- client_tag_len: `u16`
- stream_id_len: `u16`
- payload_len: `u32`
- sender bytes
- conversation bytes
- client tag bytes
- stream id bytes
- payload bytes

Payload body:

- `base`: `{"content":"...","attachments":[...]}`
- `delta`: `{"delta":"patch-text","attachments":[...]}`
- `reference`: empty payload
