export type EntryType = 'base' | 'delta' | 'reference' | 'optimistic';
export type MessageStatus = 'pending' | 'confirmed' | 'failed' | 'streaming';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export type UserProfile = {
  _id: string;
  email?: string;
  username: string;
  avatar_url: string;
  status: string;
};

export type ConversationMember = {
  user_id: string;
  joined_at: number;
  role: string;
  muted: boolean;
  profile: UserProfile | null;
};

export type FileAttachment = {
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  preview: {
    type: 'image' | 'pdf' | 'text' | 'binary';
    inline_url: string;
    text_excerpt?: string;
  };
};

export type MessageDelivery = {
  sent_at: number;
  delivered_to: Record<string, number>;
  read_by: Record<string, number>;
};

export type ChatMessage = {
  id: string;
  displayKey: string;
  content: string;
  timestamp: number;
  sequence: number;
  senderId: string;
  conversationId: string;
  clientTag: string;
  streamId: string;
  chunkIndex: number;
  totalChunks: number;
  isFinal: boolean;
  status: MessageStatus;
  storedAs: EntryType;
  origin: 'local' | 'remote';
  attachments: FileAttachment[];
  delivery: MessageDelivery;
};

export type ConversationSummary = {
  _id: string;
  type: 'direct' | 'group';
  name: string;
  description: string;
  avatar_url: string;
  members: ConversationMember[];
  created_at: number;
  archived: boolean;
  is_current_user_member: boolean;
  message_count: number;
  last_message: {
    id: string;
    content: string;
    sender_id: string;
    sequence: number;
    timestamp: number;
  } | null;
};

export type PackEntry = {
  id: string;
  type: 'base' | 'delta' | 'reference';
  baseId: string | null;
  timestamp: number;
  sequence: number;
  chunkIndex: number;
  totalChunks: number;
  senderId: string;
  conversationId: string;
  clientTag: string;
  streamId: string;
  isFinal: boolean;
  payload: string;
};

export type ControlFrame =
  | {
      type: 'hello';
      pack_version: number;
      heartbeat_ms: number;
      transport: string;
      compression: string;
    }
  | {
      type: 'welcome';
      user_id: string;
      conversation_id: string;
      heartbeat_ms: number;
      pack_version: number;
      compression: string;
    }
  | {
      type: 'ack';
      client_tag: string;
      message_id: string;
      sequence: number;
      deduplicated: boolean;
      stored_as: EntryType;
    }
  | {
      type: 'nack';
      code: string;
      message: string;
    }
  | {
      type: 'ping';
      ts: number;
    }
  | {
      type: 'pack_sent';
      reason: string;
      entries: number;
      bytes: number;
    }
  | {
      type: 'sync_complete';
      conversation_id: string;
      count: number;
    }
  | {
      type: 'receipt_update';
      conversation_id: string;
      updates: Array<{
        message_id: string;
        sequence: number;
        delivered_to: Record<string, number>;
        read_by: Record<string, number>;
      }>;
    };
