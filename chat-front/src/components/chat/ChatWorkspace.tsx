'use client';

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { apiFetch, downloadServerFile, getWsUrl, toAbsoluteAssetUrl } from '@/lib/api';
import {
  applyDelta,
  createClientTag,
  createMessageId,
  decodePackfile,
  parseEntryPayload,
} from '@/lib/chatProtocol';
import { useFileUpload } from '@/hooks/useFileUpload';
import type {
  ChatMessage,
  ConnectionState,
  ControlFrame,
  ConversationSummary,
  FileAttachment,
  MessageDelivery,
  UserProfile,
} from '@/types/chat';

function sortMessages(left: ChatMessage, right: ChatMessage) {
  const leftOrder = left.sequence > 0 ? left.sequence : left.timestamp;
  const rightOrder = right.sequence > 0 ? right.sequence : right.timestamp;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.timestamp - right.timestamp;
}

function emptyDelivery(timestamp: number, senderId = ''): MessageDelivery {
  return {
    sent_at: timestamp,
    delivered_to: senderId ? { [senderId]: timestamp } : {},
    read_by: senderId ? { [senderId]: timestamp } : {},
  };
}

function upsertMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const next = [...current];

  for (const message of incoming) {
    const index = next.findIndex(
      (candidate) =>
        candidate.id === message.id ||
        (!!message.clientTag && candidate.clientTag === message.clientTag) ||
        (!!message.streamId && candidate.streamId === message.streamId),
    );

    if (index >= 0) {
      next[index] = {
        ...next[index],
        ...message,
        delivery: {
          ...next[index].delivery,
          ...message.delivery,
          delivered_to: {
            ...next[index].delivery.delivered_to,
            ...message.delivery.delivered_to,
          },
          read_by: {
            ...next[index].delivery.read_by,
            ...message.delivery.read_by,
          },
        },
      };
      continue;
    }

    next.push(message);
  }

  return next.sort(sortMessages);
}

function getConversationTitle(conversation: ConversationSummary, currentUserId: string) {
  if (conversation.type === 'group') {
    return conversation.name;
  }

  const peer = conversation.members.find((member) => member.user_id !== currentUserId)?.profile;
  return peer?.username || conversation.name || 'Direct chat';
}

function getConversationSubtitle(conversation: ConversationSummary, currentUserId: string) {
  if (conversation.type === 'group') {
    return `${conversation.members.length} members`;
  }

  const peer = conversation.members.find((member) => member.user_id !== currentUserId)?.profile;
  return peer?.status || 'Direct message';
}

function getReceiptLabel(message: ChatMessage, currentUserId: string, recipients: number) {
  if (message.senderId !== currentUserId) {
    return message.status;
  }

  const deliveredCount = Object.keys(message.delivery.delivered_to).filter((id) => id !== currentUserId).length;
  const readCount = Object.keys(message.delivery.read_by).filter((id) => id !== currentUserId).length;

  if (readCount >= Math.max(1, recipients)) {
    return 'read';
  }

  if (deliveredCount >= Math.max(1, recipients)) {
    return 'delivered';
  }

  return message.status === 'pending' ? 'sending' : 'sent';
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function formatRelativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function getInitials(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getAvatarTone(seed: string) {
  const palette = [
    'from-emerald-500 to-teal-600',
    'from-sky-500 to-cyan-600',
    'from-amber-500 to-orange-600',
    'from-indigo-500 to-blue-600',
    'from-rose-500 to-pink-600',
  ];

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  return palette[Math.abs(hash) % palette.length];
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function ChatWorkspace() {
  const { user, accessToken, logout } = useAuth();
  const router = useRouter();
  const { uploadFile, uploading, progress, error: uploadError, clearError: clearUploadError } = useFileUpload();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<number | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarBusy, setSidebarBusy] = useState(true);
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline');
  const [lastEvent, setLastEvent] = useState('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [discoverableUsers, setDiscoverableUsers] = useState<UserProfile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [createMode, setCreateMode] = useState<'direct' | 'group'>('direct');
  const [demoStream, setDemoStream] = useState(true);

  const deferredMessages = useDeferredValue(messages);
  const visibleMessages = upsertMessages([], deferredMessages);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const objectCacheRef = useRef<Map<string, ChatMessage>>(new Map());
  const outboxRef = useRef<Map<string, unknown>>(new Map());
  const readSequenceRef = useRef(0);
  const manualCloseRef = useRef(false);

  const activeConversation = conversations.find((conversation) => conversation._id === activeConversationId) || null;
  const recipients = Math.max(0, (activeConversation?.members.length || 1) - 1);

  useEffect(() => {
    messagesRef.current = messages;
    const nextCache = new Map<string, ChatMessage>();
    messages.forEach((message) => {
      nextCache.set(message.id, message);
    });
    objectCacheRef.current = nextCache;
  }, [messages]);

  const loadConversations = useEffectEvent(async () => {
    if (!accessToken) {
      return;
    }

    const payload = await apiFetch<{ conversations: ConversationSummary[] }>('/api/conversations', {
      token: accessToken,
    });

    setConversations(payload.conversations);
    setActiveConversationId((current) => current || payload.conversations[0]?._id || '');
    setSidebarBusy(false);
  });

  const loadMessages = useEffectEvent(async (conversationId: string, before?: number | null) => {
    if (!accessToken || !conversationId) {
      return;
    }

    const query = new URLSearchParams({ limit: '30' });
    if (before) {
      query.set('before', String(before));
    }

    const payload = await apiFetch<{
      messages: Array<{
        id: string;
        conversation_id: string;
        sender_id: string;
        content: string;
        timestamp: number;
        sequence: number;
        client_tag: string;
        stream_id: string;
        chunk_index: number;
        total_chunks: number;
        is_final: boolean;
        stored_as: 'base' | 'delta' | 'reference';
        attachments: FileAttachment[];
        delivery: MessageDelivery;
      }>;
      next_cursor: number | null;
      has_more: boolean;
    }>(`/api/conversations/${conversationId}/messages?${query.toString()}`, {
      token: accessToken,
    });

    const incoming = payload.messages.map<ChatMessage>((message) => ({
      id: message.id,
      displayKey: message.stream_id ? `stream:${message.stream_id}` : message.id,
      content: message.content,
      timestamp: message.timestamp,
      sequence: message.sequence,
      senderId: message.sender_id,
      conversationId: message.conversation_id,
      clientTag: message.client_tag,
      streamId: message.stream_id,
      chunkIndex: message.chunk_index,
      totalChunks: message.total_chunks,
      isFinal: message.is_final,
      status: message.stream_id && !message.is_final ? 'streaming' : 'confirmed',
      storedAs: message.stored_as,
      origin: message.sender_id === user?._id ? 'local' : 'remote',
      attachments: message.attachments,
      delivery: message.delivery || emptyDelivery(message.timestamp, message.sender_id),
    }));

    startTransition(() => {
      setMessages((current) => (before ? upsertMessages(current, incoming) : upsertMessages([], incoming)));
    });
    setMessageCursor(payload.next_cursor);
    setHasMoreHistory(payload.has_more);
  });

  const markConversationRead = useEffectEvent(async (sequence: number) => {
    if (!accessToken || !activeConversationId || !sequence || sequence <= readSequenceRef.current) {
      return;
    }

    readSequenceRef.current = sequence;

    try {
      await apiFetch(`/api/conversations/${activeConversationId}/read`, {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({ up_to_sequence: sequence }),
      });
    } catch {
      readSequenceRef.current = Math.min(readSequenceRef.current, sequence - 1);
    }
  });

  const getLastKnownMessageId = useEffectEvent(() => {
    const confirmed = [...messagesRef.current].filter((message) => message.sequence > 0).sort(sortMessages);
    return confirmed.at(-1)?.id ?? '';
  });

  const getKnownObjectIds = useEffectEvent(() => {
    return Array.from(objectCacheRef.current.keys()).slice(-128);
  });

  const flushOutboxNow = useEffectEvent(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    outboxRef.current.forEach((message) => {
      ws.send(JSON.stringify(message));
    });
  });

  const requestSync = useEffectEvent(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeConversationId) {
      return;
    }

    ws.send(
      JSON.stringify({
        type: 'sync',
        conversation_id: activeConversationId,
        last_known_message_id: getLastKnownMessageId(),
        known_object_ids: getKnownObjectIds(),
      }),
    );
  });

  const mergeMessages = useEffectEvent((incoming: ChatMessage[]) => {
    if (!incoming.length) {
      return;
    }

    startTransition(() => {
      setMessages((current) => upsertMessages(current, incoming));
    });
  });

  const handleControlFrame = useEffectEvent((frame: ControlFrame) => {
    switch (frame.type) {
      case 'hello':
        setLastEvent(`server hello: PACK v${frame.pack_version}`);
        break;
      case 'welcome':
        setConnectionState('connected');
        setLastEvent(`joined ${frame.conversation_id}`);
        flushOutboxNow();
        break;
      case 'ack':
        outboxRef.current.delete(frame.client_tag);
        startTransition(() => {
          setMessages((current) =>
            current.map((message) =>
              message.clientTag === frame.client_tag
                ? {
                    ...message,
                    id: frame.message_id,
                    displayKey: message.streamId ? `stream:${message.streamId}` : frame.message_id,
                    sequence: frame.sequence,
                    status: message.streamId && !message.isFinal ? 'streaming' : 'confirmed',
                    storedAs: frame.stored_as,
                  }
                : message,
            ),
          );
        });
        break;
      case 'nack':
        setLastEvent(`${frame.code}: ${frame.message}`);
        startTransition(() => {
          setMessages((current) =>
            current.map((message) =>
              outboxRef.current.has(message.clientTag)
                ? {
                    ...message,
                    status: 'failed',
                  }
                : message,
            ),
          );
        });
        break;
      case 'ping':
        wsRef.current?.send(JSON.stringify({ type: 'pong', ts: frame.ts }));
        break;
      case 'pack_sent':
        setLastEvent(`received ${frame.reason} batch (${frame.entries} entries)`);
        break;
      case 'sync_complete':
        setLastEvent(`sync complete: ${frame.count} objects`);
        break;
      case 'receipt_update':
        startTransition(() => {
          setMessages((current) =>
            current.map((message) => {
              const update = frame.updates.find((item) => item.message_id === message.id);
              if (!update) {
                return message;
              }

              return {
                ...message,
                delivery: {
                  ...message.delivery,
                  delivered_to: {
                    ...message.delivery.delivered_to,
                    ...update.delivered_to,
                  },
                  read_by: {
                    ...message.delivery.read_by,
                    ...update.read_by,
                  },
                },
              };
            }),
          );
        });
        break;
    }
  });

  const handlePack = useEffectEvent(async (buffer: ArrayBuffer) => {
    try {
      const packet = new Uint8Array(buffer);
      const entries = await decodePackfile(packet);
      const resolved: ChatMessage[] = [];
      let missingBase = false;

      for (const entry of entries) {
        const cached = objectCacheRef.current.get(entry.id);
        let content = '';
        let attachments: FileAttachment[] = cached?.attachments || [];

        if (entry.type === 'base') {
          const payload = parseEntryPayload(entry);
          content = payload.content;
          attachments = payload.attachments;
        } else if (entry.type === 'delta') {
          const base = entry.baseId ? objectCacheRef.current.get(entry.baseId) : null;
          if (!base) {
            missingBase = true;
            continue;
          }
          const payload = parseEntryPayload(entry, base.attachments);
          content = applyDelta(base.content, payload.delta || '');
          attachments = payload.attachments;
        } else {
          if (!cached) {
            missingBase = true;
            continue;
          }
          content = cached.content;
          attachments = cached.attachments;
        }

        resolved.push({
          id: entry.id,
          displayKey: entry.streamId ? `stream:${entry.streamId}` : entry.id,
          content,
          timestamp: entry.timestamp,
          sequence: entry.sequence,
          senderId: entry.senderId,
          conversationId: entry.conversationId,
          clientTag: entry.clientTag,
          streamId: entry.streamId,
          chunkIndex: entry.chunkIndex,
          totalChunks: entry.totalChunks,
          isFinal: entry.isFinal,
          status: entry.streamId && !entry.isFinal ? 'streaming' : 'confirmed',
          storedAs: entry.type,
          origin: entry.senderId === user?._id ? 'local' : 'remote',
          attachments,
          delivery: cached?.delivery || emptyDelivery(entry.timestamp, entry.senderId),
        });
      }

      mergeMessages(resolved);

      const latestRemote = resolved
        .filter((message) => message.senderId !== user?._id)
        .sort(sortMessages)
        .at(-1);

      if (latestRemote?.sequence) {
        void markConversationRead(latestRemote.sequence);
      }

      if (missingBase) {
        requestSync();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pack decode failed';
      setLastEvent(message);
    }
  });

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadConversations();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void apiFetch<{ users: UserProfile[] }>('/api/users', { token: accessToken })
      .then((payload) => setDiscoverableUsers(payload.users))
      .catch(() => setDiscoverableUsers([]));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !activeConversationId) {
      return;
    }

    readSequenceRef.current = 0;
    setMessages([]);
    setMessageCursor(null);
    setHasMoreHistory(false);
    setLoadingHistory(true);

    void loadMessages(activeConversationId)
      .finally(() => setLoadingHistory(false));
  }, [accessToken, activeConversationId]);

  useEffect(() => {
    if (!accessToken || !user?._id || !activeConversationId) {
      setConnectionState('offline');
      return;
    }

    manualCloseRef.current = false;

    const connect = () => {
      setConnectionState(reconnectAttemptRef.current === 0 ? 'connecting' : 'reconnecting');
      const ws = new WebSocket(getWsUrl());
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        setLastEvent('transport established');
        ws.send(
          JSON.stringify({
            type: 'hello',
            token: accessToken,
            user_id: user._id,
            conversation_id: activeConversationId,
            last_known_message_id: getLastKnownMessageId(),
            known_object_ids: getKnownObjectIds(),
          }),
        );
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            handleControlFrame(JSON.parse(event.data) as ControlFrame);
          } catch {
            setLastEvent('ignored malformed control frame');
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          void handlePack(event.data);
          return;
        }

        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((arrayBuffer) => handlePack(arrayBuffer));
        }
      };

      ws.onerror = () => {
        setLastEvent('transport error');
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (manualCloseRef.current) {
          return;
        }

        reconnectAttemptRef.current += 1;
        setConnectionState('reconnecting');

        const delay =
          Math.min(10_000, 400 * 2 ** (reconnectAttemptRef.current - 1)) +
          Math.floor(Math.random() * 250);

        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      manualCloseRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [accessToken, activeConversationId, user?._id]);

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2 || !accessToken) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void apiFetch<{ users: UserProfile[] }>(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        token: accessToken,
      })
        .then((payload) => setSearchResults(payload.users))
        .catch(() => setSearchResults([]));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [accessToken, searchQuery]);

  async function handleCreateConversation() {
    if (!accessToken) {
      return;
    }

    const payload = await apiFetch<ConversationSummary>('/api/conversations', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify({
        type: createMode,
        name: createMode === 'group' ? groupName : '',
        member_ids: selectedMembers,
      }),
    });

    setConversations((current) => {
      const deduped = current.filter((conversation) => conversation._id !== payload._id);
      return [payload, ...deduped];
    });
    setActiveConversationId(payload._id);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMembers([]);
    setGroupName('');
  }

  async function handleStartDirectConversation(userId: string) {
    if (!accessToken) {
      return;
    }

    const payload = await apiFetch<ConversationSummary>('/api/conversations', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify({
        type: 'direct',
        member_ids: [userId],
      }),
    });

    setConversations((current) => {
      const deduped = current.filter((conversation) => conversation._id !== payload._id);
      return [payload, ...deduped];
    });
    setActiveConversationId(payload._id);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMembers([]);
  }

  function handleDownloadAttachment(attachment: FileAttachment) {
    downloadServerFile(attachment.preview.inline_url, attachment.filename);
  }

  async function handleUpload(input: HTMLInputElement) {
    if (!accessToken || !activeConversationId || !input.files?.length) {
      return;
    }

    clearUploadError();

    for (const file of Array.from(input.files)) {
      const uploaded = await uploadFile(file, activeConversationId, accessToken);
      setPendingAttachments((current) => [
        ...current,
        {
          file_id: uploaded._id,
          filename: uploaded.filename,
          mime_type: uploaded.mime_type,
          size_bytes: uploaded.size_bytes,
          preview: uploaded.preview,
        },
      ]);
    }

    input.value = '';
  }

  async function sendMessage() {
    if (!user || !activeConversationId || !activeConversation) {
      return;
    }

    const content = draft.trim();
    const attachments = [...pendingAttachments];
    if (!content && attachments.length === 0) {
      return;
    }

    setDraft('');
    setPendingAttachments([]);

    const timestamp = Date.now();
    const clientTag = createClientTag();
    const messageId = await createMessageId(content, {
      timestamp,
      senderId: user._id,
      conversationId: activeConversationId,
      clientTag,
      attachmentIds: attachments.map((attachment) => attachment.file_id),
    });

    const optimistic: ChatMessage = {
      id: messageId,
      displayKey: messageId,
      content,
      timestamp,
      sequence: 0,
      senderId: user._id,
      conversationId: activeConversationId,
      clientTag,
      streamId: '',
      chunkIndex: 0,
      totalChunks: 1,
      isFinal: true,
      status: 'pending',
      storedAs: 'optimistic',
      origin: 'local',
      attachments,
      delivery: emptyDelivery(timestamp, user._id),
    };

    const payload = {
      type: 'send_message',
      content,
      timestamp,
      sender_id: user._id,
      conversation_id: activeConversationId,
      message_id: messageId,
      client_tag: clientTag,
      attachments: attachments.map((attachment) => ({ file_id: attachment.file_id })),
      request_demo_stream: demoStream && activeConversation.members.some((member) => member.user_id === 'edge-bot@system.local'),
    };

    outboxRef.current.set(clientTag, payload);
    mergeMessages([optimistic]);
    flushOutboxNow();
    setLastEvent(`queued ${clientTag.slice(0, 8)}`);
  }

  async function loadEarlierMessages() {
    if (!activeConversationId || !messageCursor) {
      return;
    }

    setLoadingHistory(true);
    try {
      await loadMessages(activeConversationId, messageCursor);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.push('/auth/login');
  }

  const latestSequence = visibleMessages.at(-1)?.sequence || 0;
  useEffect(() => {
    const latestRemote = visibleMessages
      .filter((message) => message.senderId !== user?._id)
      .sort(sortMessages)
      .at(-1);

    if (latestRemote?.sequence) {
      void markConversationRead(latestRemote.sequence);
    }
  }, [visibleMessages, markConversationRead, user?._id, latestSequence]);

  const activeConversationTitle =
    activeConversation && user ? getConversationTitle(activeConversation, user._id) : 'Select a conversation';
  const activeConversationSubtitle =
    activeConversation && user
      ? getConversationSubtitle(activeConversation, user._id)
      : 'History, realtime sync, and files stay organized inside each room.';
  const connectedLabel =
    connectionState === 'connected'
      ? 'Live'
      : connectionState === 'reconnecting'
        ? 'Recovering'
        : 'Offline';
  const activeMemberProfiles = activeConversation?.members
    .map((member) => member.profile)
    .filter((profile): profile is UserProfile => Boolean(profile)) || [];
  const userLookup = new Map(activeMemberProfiles.map((profile) => [profile._id, profile]));

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6">
      <div className="mx-auto mb-5 max-w-[1500px]">
        <section className="surface-card rounded-[2.2rem] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
                RelayChat Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                Professional collaboration, ready for public use.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                Your conversations, files, and realtime activity now sit inside a more structured interface
                designed to feel credible for teams, customers, and communities.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 lg:min-w-[520px]">
              <article className="rounded-[1.3rem] border border-slate-200 bg-white/80 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Signed in as</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{user?.username || 'Workspace'}</div>
              </article>
              <article className="rounded-[1.3rem] border border-slate-200 bg-white/80 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Conversations</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{conversations.length}</div>
              </article>
              <article className="rounded-[1.3rem] border border-slate-200 bg-white/80 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Connection</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{connectedLabel}</div>
              </article>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-[1.3rem] border border-slate-300 bg-white/80 px-4 py-4 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[22rem_minmax(0,1fr)_20rem]">
        <aside className="surface-card rounded-[2rem] p-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Conversation Hub
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Browse rooms</h2>
              <p className="text-sm text-slate-500">Find the right audience, then move into the active thread.</p>
            </div>
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              {conversations.length}
            </span>
          </div>

          <div className="mt-5 space-y-2">
            {sidebarBusy ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                Loading conversations...
              </div>
            ) : null}

            {conversations.map((conversation) => (
              <button
                key={conversation._id}
                type="button"
                onClick={() => setActiveConversationId(conversation._id)}
                className={`w-full rounded-[1.4rem] border p-4 text-left transition ${
                  conversation._id === activeConversationId
                    ? 'border-emerald-900 bg-[#113b44] text-white shadow-[0_20px_50px_rgba(17,59,68,0.28)]'
                    : 'border-slate-200 bg-white/70 text-slate-900 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${getAvatarTone(user ? getConversationTitle(conversation, user._id) : conversation.name)} text-sm font-semibold text-white`}>
                      {getInitials(user ? getConversationTitle(conversation, user._id) : conversation.name)}
                    </div>
                    <div className="min-w-0">
                    <div className="font-semibold">
                      {user ? getConversationTitle(conversation, user._id) : conversation.name}
                    </div>
                    <div
                      className={`mt-1 text-xs ${
                        conversation._id === activeConversationId ? 'text-slate-200' : 'text-slate-500'
                      }`}
                    >
                      {user ? getConversationSubtitle(conversation, user._id) : conversation.type}
                    </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${
                      conversation._id === activeConversationId
                        ? 'bg-white/10 text-white'
                        : conversation.type === 'group'
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-sky-500/10 text-sky-700'
                    }`}
                  >
                    {conversation.type}
                  </span>
                </div>
                {conversation.last_message ? (
                  <p
                    className={`mt-3 line-clamp-2 text-sm ${
                      conversation._id === activeConversationId ? 'text-slate-100' : 'text-slate-600'
                    }`}
                  >
                    {conversation.last_message.content || `${conversation.last_message.sender_id} shared a file`}
                  </p>
                ) : (
                  <p
                    className={`mt-3 text-sm ${
                      conversation._id === activeConversationId ? 'text-slate-200' : 'text-slate-500'
                    }`}
                  >
                    No messages yet
                  </p>
                )}
                {conversation.last_message?.timestamp ? (
                  <div
                    className={`mt-3 text-[11px] uppercase tracking-[0.18em] ${
                      conversation._id === activeConversationId ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    Updated {formatRelativeTime(conversation.last_message.timestamp)}
                  </div>
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-[1.8rem] border border-slate-200 bg-slate-50/90 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Start a Conversation
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Search a person for direct chat or create a group room for your team.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setCreateMode('direct')}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${
                  createMode === 'direct' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'
                }`}
              >
                Direct
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('group')}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${
                  createMode === 'group' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'
                }`}
              >
                Group
              </button>
            </div>

            {createMode === 'group' ? (
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Group name"
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500"
              />
            ) : null}

            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search people"
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {selectedMembers.map((memberId) => {
                const member = searchResults.find((candidate) => candidate._id === memberId);
                return (
                  <button
                    key={memberId}
                    type="button"
                    onClick={() => setSelectedMembers((current) => current.filter((item) => item !== memberId))}
                    className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white"
                  >
                    {member?.username || memberId}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-2">
              {searchResults.map((candidate) => {
                const selected = selectedMembers.includes(candidate._id);
                return (
                  <button
                    key={candidate._id}
                    type="button"
                    onClick={() =>
                      setSelectedMembers((current) =>
                        selected
                          ? current.filter((item) => item !== candidate._id)
                          : [...current, candidate._id],
                      )
                    }
                    className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm ${
                      selected ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${getAvatarTone(candidate.username)} text-xs font-semibold text-white`}>
                        {getInitials(candidate.username)}
                      </span>
                      <span>{candidate.username}</span>
                    </span>
                    <span className="text-xs">{candidate.status}</span>
                  </button>
                );
              })}
            </div>

            {createMode === 'direct' ? (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Quick Chat
                </div>
                <div className="mt-3 space-y-2">
                  {discoverableUsers.slice(0, 5).map((candidate) => (
                    <button
                      key={candidate._id}
                      type="button"
                      onClick={() => void handleStartDirectConversation(candidate._id)}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/50"
                    >
                      <span className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${getAvatarTone(candidate.username)} text-xs font-semibold text-white`}>
                          {getInitials(candidate.username)}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{candidate.username}</span>
                          <span className="block text-xs text-slate-500">{candidate.status}</span>
                        </span>
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Chat
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleCreateConversation()}
              disabled={selectedMembers.length === 0 || (createMode === 'group' && !groupName.trim())}
              className="mt-4 w-full rounded-full bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create conversation
            </button>
          </div>
        </aside>

        <section className="surface-card rounded-[2rem]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Active Conversation
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                {activeConversationTitle}
              </h2>
              <p className="text-sm text-slate-500">{activeConversationSubtitle}</p>
            </div>

            <div className="grid gap-2 rounded-[1.5rem] border border-slate-200 bg-[#102136] px-4 py-3 text-sm text-white shadow-lg">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    connectionState === 'connected'
                      ? 'bg-emerald-400'
                      : connectionState === 'reconnecting'
                        ? 'bg-amber-300'
                        : 'bg-rose-400'
                  }`}
                />
                <span>{connectedLabel}</span>
              </div>
              <div className="font-mono text-xs text-slate-300">{lastEvent}</div>
            </div>
          </div>

          <div className="flex h-[calc(100vh-16rem)] flex-col">
            <div className="border-b border-slate-200 px-5 py-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-3">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Messages</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950">{messages.length}</div>
                </article>
                <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-3">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Members</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950">{activeConversation?.members.length || 0}</div>
                </article>
                <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-3">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Type</div>
                  <div className="mt-1 text-2xl font-semibold capitalize text-slate-950">{activeConversation?.type || 'chat'}</div>
                </article>
                <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={demoStream}
                      onChange={(event) => setDemoStream(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Demo assistant stream
                  </label>
                </article>
              </div>
            </div>

            <div className="chat-scroll flex-1 overflow-y-auto px-5 py-4">
              {hasMoreHistory ? (
                <div className="mb-4 text-center">
                  <button
                    type="button"
                    onClick={() => void loadEarlierMessages()}
                    disabled={loadingHistory}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-50"
                  >
                    {loadingHistory ? 'Loading...' : 'Load earlier messages'}
                  </button>
                </div>
              ) : null}

              {visibleMessages.length === 0 && !loadingHistory ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                  No messages yet. Start the conversation or upload a file to seed the object store.
                </div>
              ) : null}

              <div className="space-y-3">
                {visibleMessages.map((message) => {
                  const isSelf = message.senderId === user?._id;
                  return (
                    <article
                      key={message.displayKey}
                      className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-[1.5rem] px-4 py-3 shadow-sm ${
                          isSelf
                            ? 'bg-[#113b44] text-white'
                            : 'border border-slate-200 bg-white text-slate-900'
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] opacity-70">
                          <span>{message.senderId === user?._id ? 'You' : userLookup.get(message.senderId)?.username || message.senderId}</span>
                          <span>{message.storedAs}</span>
                          <span>{getReceiptLabel(message, user?._id || '', recipients)}</span>
                        </div>

                        {message.content ? (
                          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                        ) : null}

                        {message.attachments.length ? (
                          <div className="mt-3 space-y-3">
                            {message.attachments.map((attachment) => {
                              const assetUrl = toAbsoluteAssetUrl(attachment.preview.inline_url);
                              return (
                                <div
                                  key={attachment.file_id}
                                  className={`overflow-hidden rounded-2xl border ${
                                    isSelf ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white'
                                  }`}
                                >
                                  <div className="px-3 py-2 text-xs font-semibold">
                                    {attachment.filename}
                                  </div>
                                  {attachment.preview.type === 'image' ? (
                                    <>
                                      <img
                                        src={assetUrl}
                                        alt={attachment.filename}
                                        className="max-h-80 w-full object-cover"
                                      />
                                      <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs">
                                        <span className={isSelf ? 'text-white/70' : 'text-slate-500'}>
                                          {formatFileSize(attachment.size_bytes)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => void handleDownloadAttachment(attachment)}
                                          className={`rounded-full px-3 py-1 font-semibold ${
                                            isSelf
                                              ? 'bg-white/10 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          Download
                                        </button>
                                      </div>
                                    </>
                                  ) : null}
                                  {attachment.preview.type === 'pdf' ? (
                                    <>
                                      <iframe
                                        src={assetUrl}
                                        title={attachment.filename}
                                        className="h-72 w-full bg-white"
                                      />
                                      <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs">
                                        <span className={isSelf ? 'text-white/70' : 'text-slate-500'}>
                                          {formatFileSize(attachment.size_bytes)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => void handleDownloadAttachment(attachment)}
                                          className={`rounded-full px-3 py-1 font-semibold ${
                                            isSelf
                                              ? 'bg-white/10 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          Download
                                        </button>
                                      </div>
                                    </>
                                  ) : null}
                                  {attachment.preview.type === 'text' ? (
                                    <>
                                      <pre className="max-h-72 overflow-auto px-3 pb-3 text-xs leading-6">
                                        {attachment.preview.text_excerpt}
                                      </pre>
                                      <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs">
                                        <span className={isSelf ? 'text-white/70' : 'text-slate-500'}>
                                          {formatFileSize(attachment.size_bytes)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => void handleDownloadAttachment(attachment)}
                                          className={`rounded-full px-3 py-1 font-semibold ${
                                            isSelf
                                              ? 'bg-white/10 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          Download
                                        </button>
                                      </div>
                                    </>
                                  ) : null}
                                  {attachment.preview.type === 'binary' ? (
                                    <div className="px-3 pb-3">
                                      <div className={`mb-3 text-xs ${isSelf ? 'text-white/70' : 'text-slate-500'}`}>
                                        {formatFileSize(attachment.size_bytes)}
                                      </div>
                                      <div className="flex gap-2">
                                        <a
                                          href={assetUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                            isSelf
                                              ? 'bg-white/10 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          Open
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => void handleDownloadAttachment(attachment)}
                                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                            isSelf
                                              ? 'bg-white/10 text-white'
                                              : 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          Download
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="mt-3 text-[11px] opacity-60">
                          {formatTime(message.timestamp)} · seq {message.sequence || 'pending'}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200 px-5 py-4">
              {pendingAttachments.length ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingAttachments.map((attachment) => (
                    <button
                      key={attachment.file_id}
                      type="button"
                      onClick={() =>
                        setPendingAttachments((current) =>
                          current.filter((item) => item.file_id !== attachment.file_id),
                        )
                      }
                      className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                    >
                      {attachment.filename}
                    </button>
                  ))}
                </div>
              ) : null}

              {progress ? (
                <p className="mb-2 text-xs text-slate-500">
                  Uploading: {progress.percentage}%
                </p>
              ) : null}

              {uploadError ? (
                <p className="mb-2 text-xs text-rose-500">{uploadError}</p>
              ) : null}

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Type a message. Enter sends, Shift+Enter adds a new line."
                  className="min-h-28 w-full resize-none border-0 bg-transparent text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400"
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void handleUpload(event.currentTarget);
                      }}
                    />
                    {uploading ? 'Uploading...' : 'Attach files'}
                  </label>

                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!draft.trim() && pendingAttachments.length === 0}
                    className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <article className="surface-card rounded-[2rem] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              People
            </div>
            <div className="mt-3 space-y-3">
              {discoverableUsers.slice(0, 6).map((candidate) => (
                <button
                  key={candidate._id}
                  type="button"
                  onClick={() => void handleStartDirectConversation(candidate._id)}
                  className="flex w-full items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white/80 px-3 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50/50"
                >
                  <span className="flex items-center gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${getAvatarTone(candidate.username)} text-xs font-semibold text-white`}>
                      {getInitials(candidate.username)}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{candidate.username}</span>
                      <span className="block text-xs text-slate-500">{candidate.status}</span>
                    </span>
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Open
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="surface-card rounded-[2rem] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Conversation Tips
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <li>Use direct chat for one-to-one messaging with another user.</li>
              <li>Create group rooms when you need a shared team thread.</li>
              <li>Search helps you find people quickly without leaving the workspace.</li>
              <li>Files and text stay in one clean conversation timeline.</li>
            </ul>
          </article>

          <article className="surface-card rounded-[2rem] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Active Members
            </div>
            <div className="mt-3 space-y-3">
              {activeMemberProfiles.slice(0, 6).map((profile) => (
                <div
                  key={profile._id}
                  className="flex items-center gap-3 rounded-[1.4rem] border border-slate-200 bg-white/70 px-3 py-3"
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${getAvatarTone(profile.username)} text-xs font-semibold text-white`}>
                    {getInitials(profile.username)}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{profile.username}</span>
                    <span className="block text-xs text-slate-500">{profile.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </main>
  );
}
