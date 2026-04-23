# Chat Platform - Production Deployment Guide

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Deployment Options](#deployment-options)
5. [Monitoring & Logging](#monitoring--logging)
6. [Scaling Strategies](#scaling-strategies)
7. [Security Hardening](#security-hardening)
8. [Backup & Recovery](#backup--recovery)
9. [Performance Tuning](#performance-tuning)
10. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (`npm test`)
- [ ] No console.error or console.log in production code
- [ ] ESLint passing (`npm run lint`)
- [ ] Security audit passing (`npm audit`)
- [ ] TypeScript strict mode enabled
- [ ] CORS origins whitelist configured
- [ ] API rate limits configured
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (if using SQL)
- [ ] CSRF tokens on state-changing requests

### Security
- [ ] JWT_SECRET changed from default
- [ ] HTTPS/TLS certificates obtained and installed
- [ ] API keys rotated
- [ ] Default credentials removed
- [ ] Password hashing algorithm verified (PBKDF2 or bcrypt)
- [ ] Sensitive data encrypted at rest
- [ ] CORS properly configured
- [ ] Helmet.js security headers enabled
- [ ] DDoS protection enabled (CloudFlare/AWS WAF)
- [ ] HSTS header set (min 1 year)

### Infrastructure
- [ ] Database backups automated (daily)
- [ ] File storage configured (S3/MinIO)
- [ ] CDN configured for static assets
- [ ] Load balancer configured
- [ ] SSL/TLS certificate auto-renewal set up
- [ ] Monitoring and alerting configured
- [ ] Logging infrastructure in place
- [ ] Error tracking (Sentry/Rollbar) configured
- [ ] Uptime monitoring configured
- [ ] Disaster recovery plan documented

---

## Environment Configuration

### Backend Environment Variables

Create `.env.production`:

```bash
# Node
NODE_ENV=production
PORT=3000
WS_PORT=8080

# Security
JWT_SECRET=<generate-strong-random-key-64-chars-min>
ENCRYPTION_KEY=<generate-32-char-hex-key>

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/chat?retryWrites=true&w=majority
# OR
DATABASE_URL=postgres://user:pass@host:5432/chat

# Redis
REDIS_URL=redis://:password@redis-host:6379/0

# File Storage
STORAGE_TYPE=s3  # or 'local', 'gcs', 'azure'
AWS_S3_BUCKET=chat-files-prod
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>

# CDN
CDN_DOMAIN=https://cdn.example.com

# API Config
API_RATE_LIMIT_WINDOW=60000  # 1 minute
API_RATE_LIMIT_MAX=100  # requests per window

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
LOG_LEVEL=info  # debug, info, warn, error

# CORS
CORS_ORIGINS=https://app.example.com,https://www.example.com

# Feature Flags
ENABLE_E2E_ENCRYPTION=false  # future
ENABLE_VIDEO_CALLING=false   # future
```

### Frontend Environment Variables

Create `.env.production`:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_WS_URL=wss://api.example.com
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

---

## Database Setup

### MongoDB Production Setup

```bash
# Option 1: MongoDB Atlas (Cloud)
# 1. Create MongoDB Atlas account
# 2. Create M10+ cluster (minimum for production)
# 3. Enable backup and point-in-time recovery
# 4. Configure IP whitelist (your servers only)
# 5. Create production user with strong password
# 6. Get connection string

# Option 2: Self-Hosted Replica Set
docker run -d --name mongo-1 \
  -v mongo-data-1:/data/db \
  -p 27017:27017 \
  mongo:7 mongod --replSet rs0

# Initialize replica set
mongosh mongodb://localhost:27017
  rs.initiate()
```

### PostgreSQL Production Setup

```bash
# Using AWS RDS / Azure Database
# 1. Create multi-AZ deployment
# 2. Enable automated backups (35 days retention)
# 3. Enable encryption at rest
# 4. Configure security group for app servers only
# 5. Create production user with strong password

# Create schema
CREATE USER chat_app WITH PASSWORD '<strong-password>';
CREATE DATABASE chat_prod OWNER chat_app;
GRANT CONNECT ON DATABASE chat_prod TO chat_app;

# Backup script
pg_dump -U postgres chat_prod > backup_$(date +%s).sql
```

### Initialize Collections/Tables

```javascript
// MongoDB indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ last_seen: -1 });

db.conversations.createIndex({ 'members.user_id': 1 });
db.conversations.createIndex({ last_message_at: -1 });

db.messages.createIndex({ conversation_id: 1, sequence: 1 });
db.messages.createIndex({ sender_id: 1, timestamp: -1 });
db.messages.createIndex({ id: 1 }, { unique: true });

db.files.createIndex({ conversation_id: 1 });
db.files.createIndex({ uploaded_by: 1, created_at: -1 });
```

---

## Deployment Options

### Option 1: Heroku (Simplest)

```bash
# Install Heroku CLI
brew tap heroku/brew && brew install heroku

# Login
heroku login

# Create app
heroku create chat-platform-prod

# Add MongoDB Atlas
heroku addons:create mongolab:mlab-sandbox

# Add Redis
heroku addons:create heroku-redis:premium-0

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=<strong-key>
# ... add all other vars

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Option 2: Docker + AWS ECS

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Build stage
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "api.js"]
```

```bash
# Build and push
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

docker build -t chat-app:latest .
docker tag chat-app:latest <account>.dkr.ecr.us-east-1.amazonaws.com/chat-app:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/chat-app:latest

# Deploy to ECS
# Use AWS Console or:
aws ecs update-service --cluster chat-prod --service chat-app --force-new-deployment
```

### Option 3: Docker Compose + VPS

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    image: chat-app:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongo:27017/chat
      REDIS_URL: redis://redis:6379
    depends_on:
      - mongo
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  ws:
    image: chat-app:latest
    restart: always
    ports:
      - "8080:8080"
    environment:
      NODE_ENV: production
      PORT: 8080
      MONGODB_URI: mongodb://mongo:27017/chat
      REDIS_URL: redis://redis:6379
    depends_on:
      - mongo
      - redis

  web:
    image: chat-web:latest
    restart: always
    ports:
      - "3001:3000"
    environment:
      NEXT_PUBLIC_API_URL: https://api.example.com
      NEXT_PUBLIC_WS_URL: wss://api.example.com

  mongo:
    image: mongo:7
    restart: always
    volumes:
      - mongo-data:/data/db
    command: mongod --replSet rs0

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - api
      - web

volumes:
  mongo-data:
  redis-data:
```

```bash
# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Monitor
docker-compose logs -f api
```

### Option 4: Kubernetes

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chat-api
  template:
    metadata:
      labels:
        app: chat-api
    spec:
      containers:
      - name: api
        image: chat-app:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: mongodb-uri
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

```bash
# Deploy to K8s
kubectl apply -f deployment.yaml
kubectl expose deployment chat-api --type=LoadBalancer --port=80 --target-port=3000
```

---

## Monitoring & Logging

### Application Monitoring

```javascript
// Prometheus metrics
const prometheus = require('prom-client');

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});

const activeConnections = new prometheus.Gauge({
  name: 'ws_active_connections',
  help: 'Number of active WebSocket connections',
});

// Use in middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route, res.statusCode).observe(duration);
  });
  next();
});

// Expose metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});
```

### Centralized Logging

```javascript
// Winston logger
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'chat-api' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Send to CloudWatch / ELK / Datadog
if (process.env.NODE_ENV === 'production') {
  logger.add(new WinstonCloudWatch({
    logGroupName: '/aws/ecs/chat-api',
    logStreamName: 'production',
  }));
}
```

### Error Tracking

```javascript
// Sentry
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// Use in error handler
app.use(Sentry.Handlers.errorHandler());
```

---

## Scaling Strategies

### Horizontal Scaling

```bash
# Load balancer configuration (nginx)
upstream backend {
  least_conn;  # Use least connections algorithm
  server api-1.internal:3000 weight=1;
  server api-2.internal:3000 weight=1;
  server api-3.internal:3000 weight=1;
  # Health checks
  keepalive 32;
}

server {
  listen 80;
  location /api {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
  }
}
```

### Database Scaling

```javascript
// Connection pooling
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 50,        // Max connections
  minPoolSize: 10,        // Min connections
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// OR with MongoDB replica set for read replicas
const replicaSetUri = 'mongodb://primary:27017,secondary1:27017,secondary2:27017/?replicaSet=rs0&readPreference=secondaryPreferred';
```

### Caching Strategy

```javascript
// Redis multi-tier caching
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

// Cache user profiles (1 hour)
async function getUserProfile(userId) {
  const cached = await client.get(`user:${userId}`);
  if (cached) return JSON.parse(cached);

  const user = await User.findById(userId);
  await client.setEx(`user:${userId}`, 3600, JSON.stringify(user));
  return user;
}

// Cache conversation list (5 minutes)
async function getUserConversations(userId) {
  const cached = await client.get(`conversations:${userId}`);
  if (cached) return JSON.parse(cached);

  const convs = await Conversation.find({ 'members.user_id': userId });
  await client.setEx(`conversations:${userId}`, 300, JSON.stringify(convs));
  return convs;
}
```

---

## Security Hardening

### Network Security

```bash
# AWS Security Group example
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp --port 443 --cidr 0.0.0.0/0 \
  --region us-east-1

# Deny all by default, allow specific IPs only for admin access
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp --port 22 --cidr 203.0.113.0/32 \
  --region us-east-1
```

### Application Security Headers

```javascript
const helmet = require('helmet');

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.example.com"],
  },
}));
```

### Rate Limiting (Distributed)

```javascript
const RedisStore = require('rate-limit-redis');
const rateLimit = require('express-rate-limit');
const redis = require('redis');

const client = redis.createClient(process.env.REDIS_URL);

const limiter = rateLimit({
  store: new RedisStore({
    client: client,
    prefix: 'rate-limit:',
  }),
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
```

### Secrets Management

```bash
# Option 1: AWS Secrets Manager
aws secretsmanager create-secret \
  --name chat-api/prod/jwt-secret \
  --secret-string '<strong-random-key>'

# Option 2: HashiCorp Vault
vault kv put secret/chat-api/prod \
  jwt_secret='<strong-key>' \
  db_password='<password>'
```

---

## Backup & Recovery

### Automated Backups

```bash
# MongoDB Backup (daily)
#!/bin/bash
BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

mongodump \
  --uri="$MONGODB_URI" \
  --out="$BACKUP_DIR/backup_$DATE"

# Compress and upload to S3
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" "$BACKUP_DIR/backup_$DATE"
aws s3 cp "$BACKUP_DIR/backup_$DATE.tar.gz" s3://chat-backups/

# Keep only last 30 days
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

```bash
# PostgreSQL Backup (daily)
#!/bin/bash
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)

pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# Upload to S3
aws s3 cp "$BACKUP_DIR/backup_$DATE.sql.gz" s3://chat-backups/

# Keep only last 30 days
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

### Recovery Procedure

```bash
# MongoDB recovery
mongorestore \
  --uri="$MONGODB_URI" \
  --dir=/backups/mongodb/backup_20240101_000000

# PostgreSQL recovery
gunzip < /backups/postgres/backup_20240101_000000.sql.gz | \
  psql -h $DB_HOST -U $DB_USER $DB_NAME
```

---

## Performance Tuning

### Database Query Optimization

```javascript
// Add proper indexes
db.messages.createIndex({ conversation_id: 1, sequence: 1 });
db.messages.createIndex({ sender_id: 1, timestamp: -1 });

// Use .lean() in Mongoose for read-only queries
const messages = await Message
  .find({ conversation_id: convId })
  .lean()
  .exec();

// Pagination to limit results
const PAGE_SIZE = 50;
const messages = await Message
  .find({ conversation_id: convId })
  .skip((page - 1) * PAGE_SIZE)
  .limit(PAGE_SIZE)
  .sort({ sequence: -1 });
```

### WebSocket Optimization

```javascript
// Batch messages for broadcast
const BATCH_INTERVAL_MS = 12;  // 12ms window
const pendingBroadcasts = new Map();

function scheduleBroadcast(conversationId, message) {
  if (!pendingBroadcasts.has(conversationId)) {
    pendingBroadcasts.set(conversationId, {
      messages: [],
      timer: null,
    });
  }

  const batch = pendingBroadcasts.get(conversationId);
  batch.messages.push(message);

  if (!batch.timer) {
    batch.timer = setTimeout(() => {
      flushBroadcast(conversationId);
      pendingBroadcasts.delete(conversationId);
    }, BATCH_INTERVAL_MS);
  }
}
```

### Memory Management

```javascript
// Monitor memory usage
const os = require('os');
setInterval(() => {
  const used = process.memoryUsage();
  console.log(`Memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`);

  // Alert if above threshold
  if (used.heapUsed > 800 * 1024 * 1024) {  // 800MB
    console.error('Memory usage critical!');
    // Trigger garbage collection or restart
  }
}, 60000);  // Every minute
```

---

## Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check for memory leaks
node --inspect=0.0.0.0:9229 api.js

# Take heap snapshot
# Use Chrome DevTools: chrome://inspect
# Analyze for detached DOM nodes, event listeners

# Node flags to limit memory
node --max-old-space-size=2048 api.js  # 2GB limit
```

#### Database Connection Failures
```javascript
// Add connection retry logic
async function connectWithRetry() {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✓ Database connected');
      return;
    } catch (err) {
      retries++;
      const delay = Math.pow(2, retries) * 1000;  // Exponential backoff
      console.log(`Retry ${retries}/${maxRetries} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Failed to connect to database after 5 retries');
}
```

#### WebSocket Connection Issues
```javascript
// Monitor connection health
let deadConnections = 0;
const PING_INTERVAL = 30000;  // 30 seconds
const PONG_TIMEOUT = 60000;   // 60 seconds

wss.on('connection', (ws) => {
  ws.isAlive = true;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    deadConnections++;
  });
});

// Kill dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);
```

### Monitoring Checklist

```markdown
## Daily
- [ ] Check error logs for exceptions
- [ ] Verify backup completion
- [ ] Monitor disk space usage
- [ ] Check API response times

## Weekly
- [ ] Review database query performance
- [ ] Analyze user growth metrics
- [ ] Check security audit logs
- [ ] Review CDN cache hit rate

## Monthly
- [ ] Full disaster recovery test
- [ ] Security penetration test
- [ ] Performance review and tuning
- [ ] Capacity planning analysis
```

---

## Production Readiness Checklist

- [ ] All endpoints tested and working
- [ ] Load testing passed (1000+ concurrent users)
- [ ] Failover tested (database, Redis, servers)
- [ ] Backup and recovery tested
- [ ] Monitoring and alerting working
- [ ] Security audit passed
- [ ] Performance metrics baseline established
- [ ] Documentation complete
- [ ] Runbooks written for common issues
- [ ] On-call rotation established

Deploy with confidence! 🚀
