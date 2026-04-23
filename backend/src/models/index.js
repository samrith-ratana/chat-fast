const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const FILES_FILE = path.join(DATA_DIR, 'files.json');

const users = new Map();
const conversations = new Map();
const files = new Map();

const SYSTEM_USERS = [
  {
    _id: 'edge-bot@system.local',
    email: 'edge-bot@system.local',
    username: 'edge-bot',
    avatar_url: 'https://ui-avatars.com/api/?name=Edge+Bot&background=0f172a&color=ffffff',
  },
  {
    _id: 'ops-bot@system.local',
    email: 'ops-bot@system.local',
    username: 'ops-bot',
    avatar_url: 'https://ui-avatars.com/api/?name=Ops+Bot&background=14532d&color=ffffff',
  },
];

function saveJson(file, values) {
  fs.writeFileSync(file, JSON.stringify(values, null, 2));
}

function loadJson(file) {
  if (!fs.existsSync(file)) {
    return [];
  }

  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) {
    return [];
  }

  return JSON.parse(raw);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function persist() {
  ensureDataDir();
  saveJson(USERS_FILE, Array.from(users.values()));
  saveJson(CONVERSATIONS_FILE, Array.from(conversations.values()));
  saveJson(FILES_FILE, Array.from(files.values()));
}

function loadStore() {
  ensureDataDir();

  loadJson(USERS_FILE).forEach((user) => {
    users.set(user._id, user);
  });

  loadJson(CONVERSATIONS_FILE).forEach((conversation) => {
    conversations.set(conversation._id, conversation);
  });

  loadJson(FILES_FILE).forEach((file) => {
    files.set(file._id, file);
  });
}

function createSystemUser(user) {
  if (users.has(user._id)) {
    return users.get(user._id);
  }

  const now = Date.now();
  const record = {
    ...user,
    password_hash: null,
    status: 'online',
    status_message: 'System assistant',
    created_at: now,
    last_seen: now,
    preferences: {
      theme: 'auto',
      notifications_enabled: false,
      email_notifications: false,
      blocked_users: [],
    },
    conversations: [],
    friends: [],
    friend_requests: {
      sent: [],
      received: [],
    },
  };

  users.set(record._id, record);
  return record;
}

function createConversationRecord({ id = crypto.randomUUID(), type, createdBy, name, memberIds, description }) {
  const now = Date.now();
  return {
    _id: id,
    type,
    name,
    description: description || '',
    avatar_url: '',
    members: memberIds.map((userId) => ({
      user_id: userId,
      joined_at: now,
      role: userId === createdBy ? 'owner' : 'member',
      muted: false,
    })),
    created_at: now,
    created_by: createdBy,
    last_message_id: '',
    last_message_at: now,
    message_count: 0,
    pinned_messages: [],
    archived: false,
    encryption: 'none',
  };
}

function ensureConversationMembership(userId, conversationId) {
  const user = users.get(userId);
  const conversation = conversations.get(conversationId);

  if (!user || !conversation) {
    return null;
  }

  if (!user.conversations.includes(conversationId)) {
    user.conversations.push(conversationId);
  }

  if (!conversation.members.some((member) => member.user_id === userId)) {
    conversation.members.push({
      user_id: userId,
      joined_at: Date.now(),
      role: 'member',
      muted: false,
    });
  }

  return conversation;
}

function ensureLaunchpadRoom() {
  const existing = Array.from(conversations.values()).find(
    (conversation) => conversation.type === 'group' && conversation.slug === 'launchpad',
  );

  if (existing) {
    return existing;
  }

  const memberIds = SYSTEM_USERS.map((user) => user._id);
  const launchpad = {
    ...createConversationRecord({
      id: 'room-launchpad',
      type: 'group',
      createdBy: SYSTEM_USERS[0]._id,
      name: 'Bandwidth Launchpad',
      memberIds,
      description: 'Default operations room for realtime, low-bandwidth chat.',
    }),
    slug: 'launchpad',
  };

  conversations.set(launchpad._id, launchpad);
  memberIds.forEach((userId) => ensureConversationMembership(userId, launchpad._id));
  return launchpad;
}

function ensureWelcomeDirect(userId) {
  const existing = Conversation.findByMembers([userId, SYSTEM_USERS[0]._id]);
  if (existing) {
    return existing;
  }

  return Conversation.create('direct', SYSTEM_USERS[0]._id, 'Edge Bot', [SYSTEM_USERS[0]._id, userId]);
}

function initialize() {
  loadStore();
  SYSTEM_USERS.forEach(createSystemUser);
  ensureLaunchpadRoom();
  persist();
  console.log(`✓ Database initialized: ${users.size} users, ${conversations.size} conversations, ${files.size} files`);
}

setInterval(() => {
  try {
    persist();
  } catch (error) {
    console.error('Persistence error:', error.message);
  }
}, 3000);

const User = {
  create(email, username, passwordHash) {
    if (users.has(email)) {
      throw new Error('User with this email already exists');
    }

    const now = Date.now();
    const user = {
      _id: email,
      email,
      username,
      password_hash: passwordHash,
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=1e293b&color=ffffff`,
      status: 'offline',
      status_message: '',
      created_at: now,
      last_seen: now,
      preferences: {
        theme: 'auto',
        notifications_enabled: true,
        email_notifications: false,
        blocked_users: [],
      },
      conversations: [],
      friends: [],
      friend_requests: {
        sent: [],
        received: [],
      },
    };

    users.set(user._id, user);
    return user;
  },

  findById(userId) {
    return users.get(userId) || null;
  },

  findByEmail(email) {
    return users.get(email) || null;
  },

  findByUsername(username) {
    return Array.from(users.values()).find((user) => user.username === username) || null;
  },

  search(query) {
    const lowerQuery = String(query || '').toLowerCase();

    return Array.from(users.values())
      .filter((user) => user.password_hash || user._id.endsWith('@system.local'))
      .filter((user) => {
        return (
          user.username.toLowerCase().includes(lowerQuery) ||
          user.email.toLowerCase().includes(lowerQuery)
        );
      })
      .map((user) => ({
        _id: user._id,
        username: user.username,
        avatar_url: user.avatar_url,
        status: user.status,
      }));
  },

  listDiscoverable(excludeUserId = '') {
    return Array.from(users.values())
      .filter((user) => user._id !== excludeUserId)
      .filter((user) => user.password_hash || user._id.endsWith('@system.local'))
      .sort((left, right) => {
        if (left.status === right.status) {
          return left.username.localeCompare(right.username);
        }

        return left.status === 'online' ? -1 : 1;
      })
      .map((user) => ({
        _id: user._id,
        username: user.username,
        avatar_url: user.avatar_url,
        status: user.status,
      }));
  },

  update(userId, updates) {
    const user = users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    ['avatar_url', 'status', 'status_message', 'preferences'].forEach((key) => {
      if (updates[key] !== undefined) {
        user[key] = updates[key];
      }
    });

    user.last_seen = Date.now();
    return user;
  },

  setStatus(userId, status, message = '') {
    const user = users.get(userId);
    if (!user) {
      return null;
    }

    user.status = status;
    user.status_message = message;
    user.last_seen = Date.now();
    return user;
  },

  addConversation(userId, conversationId) {
    const user = users.get(userId);
    if (!user) {
      return null;
    }

    if (!user.conversations.includes(conversationId)) {
      user.conversations.push(conversationId);
    }

    return user;
  },

  bootstrapUser(userId) {
    const launchpad = ensureLaunchpadRoom();
    ensureConversationMembership(userId, launchpad._id);
    ensureWelcomeDirect(userId);
    return User.findById(userId);
  },

  getAll() {
    return Array.from(users.values());
  },
};

const Conversation = {
  create(type, createdBy, name = '', memberIds = []) {
    const uniqueMembers = Array.from(new Set(memberIds));
    const conversation = createConversationRecord({
      type,
      createdBy,
      name,
      memberIds: uniqueMembers,
    });

    conversations.set(conversation._id, conversation);
    uniqueMembers.forEach((userId) => ensureConversationMembership(userId, conversation._id));
    return conversation;
  },

  findById(conversationId) {
    return conversations.get(conversationId) || null;
  },

  findByMembers(userIds) {
    const lookup = [...userIds].sort().join('|');
    return (
      Array.from(conversations.values()).find((conversation) => {
        if (conversation.type !== 'direct') {
          return false;
        }

        const members = conversation.members.map((member) => member.user_id).sort().join('|');
        return members === lookup;
      }) || null
    );
  },

  getForUser(userId) {
    return Array.from(conversations.values())
      .filter((conversation) => conversation.members.some((member) => member.user_id === userId))
      .sort((left, right) => right.last_message_at - left.last_message_at);
  },

  addMember(conversationId, userId, role = 'member') {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return null;
    }

    if (!conversation.members.some((member) => member.user_id === userId)) {
      conversation.members.push({
        user_id: userId,
        joined_at: Date.now(),
        role,
        muted: false,
      });
    }

    User.addConversation(userId, conversationId);
    return conversation;
  },

  update(conversationId, updates) {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return null;
    }

    ['name', 'description', 'avatar_url', 'archived', 'last_message_id', 'last_message_at', 'message_count'].forEach((key) => {
      if (updates[key] !== undefined) {
        conversation[key] = updates[key];
      }
    });

    return conversation;
  },

  touch(conversationId, message) {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return null;
    }

    conversation.last_message_id = message.id;
    conversation.last_message_at = message.timestamp;
    conversation.message_count = Number(conversation.message_count || 0) + 1;
    return conversation;
  },

  getAll() {
    return Array.from(conversations.values());
  },

  ensureLaunchpadMembership(userId) {
    const launchpad = ensureLaunchpadRoom();
    ensureConversationMembership(userId, launchpad._id);
    return launchpad;
  },
};

const File = {
  create(record) {
    const file = {
      _id: record._id || crypto.randomUUID(),
      conversation_id: record.conversation_id,
      message_id: record.message_id || '',
      uploaded_by: record.uploaded_by,
      original_filename: record.original_filename,
      safe_filename: record.safe_filename,
      mime_type: record.mime_type,
      size_bytes: record.size_bytes,
      storage_path: record.storage_path,
      storage_type: record.storage_type || 'local',
      processing_status: record.processing_status || 'ready',
      error: record.error || null,
      preview: record.preview || { type: 'binary', inline_url: '', text_excerpt: '' },
      variants: record.variants || [],
      created_at: record.created_at || Date.now(),
      expires_at: record.expires_at || null,
      access_token: record.access_token || crypto.randomBytes(16).toString('hex'),
    };

    files.set(file._id, file);
    return file;
  },

  findById(fileId) {
    return files.get(fileId) || null;
  },

  findByConversation(conversationId) {
    return Array.from(files.values())
      .filter((file) => file.conversation_id === conversationId)
      .sort((left, right) => right.created_at - left.created_at);
  },

  update(fileId, updates) {
    const file = files.get(fileId);
    if (!file) {
      return null;
    }

    ['message_id', 'processing_status', 'error', 'variants', 'preview', 'expires_at'].forEach((key) => {
      if (updates[key] !== undefined) {
        file[key] = updates[key];
      }
    });

    return file;
  },

  getAll() {
    return Array.from(files.values());
  },
};

module.exports = {
  Conversation,
  File,
  User,
  initialize,
  persist,
};
