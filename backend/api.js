const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const { requireAuth, optionalAuth } = require('./src/auth/middleware');
const { createAccessToken, createRefreshToken, verifyToken } = require('./src/auth/jwt');
const { hashPassword, validatePasswordStrength, verifyPassword } = require('./src/auth/password');
const { Conversation, File, User, initialize } = require('./src/models');
const { createRateLimiter } = require('./src/lib/rateLimit');
const { getAllowedOrigins, isPrivateDevOrigin, requestContext, requireTrustedOrigin } = require('./src/lib/security');
const {
  inferPreviewKind,
  parseLimit,
  parseSequenceCursor,
  sanitizeEmail,
  sanitizeFilename,
  sanitizeIdentifier,
  sanitizePlainText,
  sanitizeUsername,
} = require('./src/lib/validation');

const STORAGE_DIR = path.join(__dirname, 'storage', 'files');
const API_PORT = Number(process.env.PORT || 8080);
const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_UPLOAD_SIZE_LABEL = '8GB';

function mapOperationalError(error) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        statusCode: 413,
        message: `File size exceeds ${MAX_UPLOAD_SIZE_LABEL} limit`,
      };
    }

    return {
      statusCode: 400,
      message: error.message || 'Upload failed',
    };
  }

  if (error?.code === 'ENOSPC') {
    return {
      statusCode: 507,
      message: 'Upload failed: not enough disk space on the server',
    };
  }

  if (error?.code === 'ECONNRESET') {
    return {
      statusCode: 408,
      message: 'Upload interrupted before completion',
    };
  }

  return null;
}

function ensureConversationAccess(conversationId, userId) {
  const conversation = Conversation.findById(conversationId);
  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }

  if (!conversation.members.some((member) => member.user_id === userId)) {
    const error = new Error('Not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }

  return conversation;
}

function buildConversationResponse(conversation, runtime, currentUserId) {
  const stats = runtime.getConversationStats(conversation._id);

  return {
    _id: conversation._id,
    type: conversation.type,
    name: conversation.name,
    description: conversation.description,
    avatar_url: conversation.avatar_url,
    members: conversation.members.map((member) => {
      const user = User.findById(member.user_id);
      return {
        ...member,
        profile: user
          ? {
              _id: user._id,
              username: user.username,
              avatar_url: user.avatar_url,
              status: user.status,
            }
          : null,
      };
    }),
    created_at: conversation.created_at,
    archived: conversation.archived,
    is_current_user_member: conversation.members.some((member) => member.user_id === currentUserId),
    message_count: stats.message_count,
    last_message: stats.last_message,
  };
}

function createApp(options = {}) {
  const runtime = options.runtime;
  const realtime = options.realtime || { broadcastReceiptUpdates() {}, broadcastMessagePack() {} };

  initialize();
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  const app = express();
  const authLimiter = createRateLimiter({ windowMs: 60_000, max: 20, message: 'Too many auth attempts' });
  const mutationLimiter = createRateLimiter({ windowMs: 60_000, max: 120, message: 'Too many write requests' });

  const allowedOrigins = getAllowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin) || (process.env.NODE_ENV !== 'production' && isPrivateDevOrigin(origin))) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin not allowed'));
      },
      credentials: false,
    }),
  );
  app.use(requestContext);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const storage = multer.diskStorage({
    destination(req, file, cb) {
      cb(null, STORAGE_DIR);
    },
    filename(req, file, cb) {
      const safeFilename = sanitizeFilename(file.originalname);
      cb(null, `${Date.now()}-${safeFilename}`);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: MAX_UPLOAD_SIZE_BYTES,
      files: 1,
    },
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/architecture', requireAuth, (req, res) => {
    res.json(runtime.getArchitectureSnapshot());
  });

  app.post('/api/auth/register', requireTrustedOrigin, authLimiter, (req, res) => {
    try {
      const email = sanitizeEmail(req.body.email);
      const username = sanitizeUsername(req.body.username);
      const password = String(req.body.password || '');

      const strengthCheck = validatePasswordStrength(password);
      if (!strengthCheck.valid) {
        return res.status(400).json({
          error: 'Password too weak',
          details: strengthCheck.errors,
        });
      }

      if (User.findByEmail(email)) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      if (User.findByUsername(username)) {
        return res.status(409).json({ error: 'Username already taken' });
      }

      const passwordHash = hashPassword(password);
      const user = User.create(email, username, passwordHash);
      User.bootstrapUser(user._id);
      User.setStatus(user._id, 'online');

      const accessToken = createAccessToken(user._id, user.email, user.username);
      const refreshToken = createRefreshToken(user._id);

      res.status(201).json({
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          avatar_url: user.avatar_url,
          status: 'online',
        },
        accessToken,
        refreshToken,
      });
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.post('/api/auth/login', requireTrustedOrigin, authLimiter, (req, res) => {
    try {
      const email = sanitizeEmail(req.body.email);
      const password = String(req.body.password || '');
      const user = User.findByEmail(email);

      if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      User.setStatus(user._id, 'online');

      res.json({
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          avatar_url: user.avatar_url,
          status: 'online',
        },
        accessToken: createAccessToken(user._id, user.email, user.username),
        refreshToken: createRefreshToken(user._id),
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/auth/refresh', requireTrustedOrigin, authLimiter, (req, res) => {
    const token = String(req.body.refreshToken || '');
    const result = verifyToken(token);

    if (!result.ok || result.payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = User.findById(result.payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      accessToken: createAccessToken(user._id, user.email, user.username),
    });
  });

  app.post('/api/auth/logout', requireTrustedOrigin, requireAuth, mutationLimiter, (req, res) => {
    User.setStatus(req.user.sub, 'offline');
    res.json({ message: 'Logout successful' });
  });

  app.get('/api/users/me', requireAuth, (req, res) => {
    const user = User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id: user._id,
      email: user.email,
      username: user.username,
      avatar_url: user.avatar_url,
      status: user.status,
      status_message: user.status_message,
      conversations: user.conversations,
      preferences: user.preferences,
      created_at: user.created_at,
    });
  });

  app.put('/api/users/me', requireTrustedOrigin, requireAuth, mutationLimiter, (req, res) => {
    try {
      const updates = {};
      if (req.body.avatar_url !== undefined) {
        updates.avatar_url = String(req.body.avatar_url).slice(0, 500);
      }
      if (req.body.status_message !== undefined) {
        updates.status_message = sanitizePlainText(req.body.status_message, {
          maxLength: 140,
          allowEmpty: true,
        });
      }

      const user = User.update(req.user.sub, updates);
      res.json({
        _id: user._id,
        username: user.username,
        avatar_url: user.avatar_url,
        status_message: user.status_message,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/users/search', requireAuth, (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const results = User.search(query).filter((user) => user._id !== req.user.sub).slice(0, 20);
    res.json({ count: results.length, users: results });
  });

  app.get('/api/users', requireAuth, (req, res) => {
    const users = User.listDiscoverable(req.user.sub).slice(0, 24);
    res.json({ count: users.length, users });
  });

  app.get('/api/conversations', requireAuth, (req, res) => {
    const conversations = Conversation.getForUser(req.user.sub).map((conversation) =>
      buildConversationResponse(conversation, runtime, req.user.sub),
    );

    res.json({
      count: conversations.length,
      conversations,
    });
  });

  app.post('/api/conversations', requireTrustedOrigin, requireAuth, mutationLimiter, (req, res) => {
    try {
      const type = sanitizeIdentifier(req.body.type, 'Conversation type', 10);
      if (!['direct', 'group'].includes(type)) {
        return res.status(400).json({ error: 'Invalid conversation type' });
      }

      const memberIds = Array.from(
        new Set([req.user.sub, ...((Array.isArray(req.body.member_ids) ? req.body.member_ids : []).map((value) => String(value)))]),
      );

      if (memberIds.length < 2) {
        return res.status(400).json({ error: 'A conversation requires at least two members' });
      }

      memberIds.forEach((memberId) => {
        if (!User.findById(memberId)) {
          throw new Error(`User ${memberId} not found`);
        }
      });

      if (type === 'direct') {
        const existing = Conversation.findByMembers(memberIds);
        if (existing) {
          return res.json(buildConversationResponse(existing, runtime, req.user.sub));
        }
      }

      const name = type === 'group'
        ? sanitizePlainText(req.body.name || 'New Group', { maxLength: 60 })
        : sanitizePlainText(req.body.name || '', { maxLength: 60, allowEmpty: true });

      const conversation = Conversation.create(type, req.user.sub, name, memberIds);
      res.status(201).json(buildConversationResponse(conversation, runtime, req.user.sub));
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.get('/api/conversations/:conversationId', requireAuth, (req, res) => {
    try {
      const conversation = ensureConversationAccess(req.params.conversationId, req.user.sub);
      res.json(buildConversationResponse(conversation, runtime, req.user.sub));
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.get('/api/conversations/:conversationId/messages', requireAuth, (req, res) => {
    try {
      ensureConversationAccess(req.params.conversationId, req.user.sub);
      const beforeSequence = parseSequenceCursor(req.query.before);
      const limit = parseLimit(req.query.limit, 30, 100);
      const result = runtime.listMessages(req.params.conversationId, {
        beforeSequence,
        limit,
      });

      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.post('/api/conversations/:conversationId/messages', requireTrustedOrigin, requireAuth, mutationLimiter, (req, res) => {
    try {
      ensureConversationAccess(req.params.conversationId, req.user.sub);
      const content = sanitizePlainText(req.body.content || '', { maxLength: 4000, allowEmpty: true });
      const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

      const { message } = runtime.storeIncomingMessage({
        content,
        timestamp: Number(req.body.timestamp || Date.now()),
        sender_id: req.user.sub,
        conversation_id: req.params.conversationId,
        message_id: req.body.message_id || '',
        client_tag: req.body.client_tag || '',
        stream_id: req.body.stream_id || '',
        chunk_index: Number(req.body.chunk_index || 0),
        total_chunks: Number(req.body.total_chunks || 1),
        is_final: req.body.is_final !== false,
        attachments,
      });

      realtime.broadcastMessagePack(req.params.conversationId, [message], 'rest');
      res.status(201).json(runtime.getMessageForApi(message));
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.post('/api/conversations/:conversationId/read', requireTrustedOrigin, requireAuth, mutationLimiter, (req, res) => {
    try {
      ensureConversationAccess(req.params.conversationId, req.user.sub);
      const upToSequence = Number(req.body.up_to_sequence || 0);
      if (!upToSequence) {
        return res.status(400).json({ error: 'up_to_sequence is required' });
      }

      const updates = runtime.markRead(req.params.conversationId, req.user.sub, { upToSequence });
      realtime.broadcastReceiptUpdates(req.params.conversationId, updates);
      res.json({ updated: updates.length, updates });
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.post('/api/conversations/:conversationId/members', requireTrustedOrigin, requireAuth, mutationLimiter, (req, res) => {
    try {
      const conversation = ensureConversationAccess(req.params.conversationId, req.user.sub);
      const currentMember = conversation.members.find((member) => member.user_id === req.user.sub);
      if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const userId = sanitizeIdentifier(req.body.user_id, 'User ID', 120);
      if (!User.findById(userId)) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updated = Conversation.addMember(conversation._id, userId);
      res.status(201).json(buildConversationResponse(updated, runtime, req.user.sub));
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.post(
    '/api/files/upload',
    requireTrustedOrigin,
    requireAuth,
    mutationLimiter,
    (req, res, next) => {
      upload.single('file')(req, res, (error) => {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `File size exceeds ${MAX_UPLOAD_SIZE_LABEL} limit` });
        }

        if (error) {
          return next(error);
        }

        next();
      });
    },
    (req, res) => {
      try {
        const conversationId = sanitizeIdentifier(req.body.conversation_id, 'Conversation ID', 128);
        ensureConversationAccess(conversationId, req.user.sub);

        if (!req.file) {
          return res.status(400).json({ error: 'File is required' });
        }

        const previewType = inferPreviewKind(req.file.mimetype);
        let textExcerpt = '';
        if (previewType === 'text') {
          textExcerpt = fs.readFileSync(req.file.path, 'utf8').slice(0, 2000);
        }

        const file = File.create({
          conversation_id: conversationId,
          uploaded_by: req.user.sub,
          original_filename: req.file.originalname,
          safe_filename: sanitizeFilename(req.file.originalname),
          mime_type: req.file.mimetype || 'application/octet-stream',
          size_bytes: req.file.size,
          storage_path: req.file.path,
          preview: {
            type: previewType,
            inline_url: '',
            text_excerpt: textExcerpt,
          },
        });

        File.update(file._id, {
          preview: {
            ...file.preview,
            inline_url: `/api/files/${file._id}/content?token=${file.access_token}`,
          },
        });

        const response = File.findById(file._id);
        res.status(201).json({
          _id: response._id,
          conversation_id: response.conversation_id,
          filename: response.original_filename,
          mime_type: response.mime_type,
          size_bytes: response.size_bytes,
          preview: response.preview,
          download_url: `/api/files/${response._id}/content?token=${response.access_token}`,
          access_token: response.access_token,
        });
      } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
      }
    },
  );

  app.get('/api/files/:fileId', requireAuth, (req, res) => {
    try {
      const file = File.findById(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      ensureConversationAccess(file.conversation_id, req.user.sub);
      res.json(file);
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  });

  app.get('/api/files/:fileId/content', optionalAuth, (req, res) => {
    try {
      const file = File.findById(req.params.fileId);
      if (!file || !fs.existsSync(file.storage_path)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const token = String(req.query.token || '');
      const hasAccessToken = token && token === file.access_token;
      const hasUserAccess = req.user
        ? !!Conversation.findById(file.conversation_id)?.members.some((member) => member.user_id === req.user.sub)
        : false;

      if (!hasAccessToken && !hasUserAccess) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Length', String(file.size_bytes));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const disposition = String(req.query.download || '') === '1' ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename="${file.safe_filename}"`);
      fs.createReadStream(file.storage_path).pipe(res);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    console.error('API error:', err);
    const mapped = mapOperationalError(err);
    if (mapped) {
      return res.status(mapped.statusCode).json({
        error: mapped.message,
        request_id: req.requestId,
      });
    }

    const message =
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err?.message || 'Internal server error';

    res.status(err?.statusCode || 500).json({ error: message, request_id: req.requestId });
  });

  return app;
}

if (require.main === module) {
  const { createChatRuntime } = require('./src/chat/runtime');
  const runtime = createChatRuntime();
  const app = createApp({ runtime });
  app.listen(API_PORT, () => {
    console.log(`HTTP API running on http://localhost:${API_PORT}`);
  });
}

module.exports = {
  createApp,
};
