import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { roomRouter } from './routes/room.js';
import { setupSignaling } from './signaling/socket.js';
import { startCleanupService } from './services/cleanup.js';

export function createApp(): { app: Express; server: http.Server; io: SocketIOServer } {
  const app = express();
  const server = http.createServer(app);

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Let frontend handle SPA CSP
    crossOriginEmbedderPolicy: false
  }));

  // CORS Configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);
      // In development or when origin matches
      if (config.corsOrigin.includes('*') || config.corsOrigin.includes(origin) || config.nodeEnv === 'development') {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for local preview
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  }));

  // Global Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // max 200 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  });
  app.use('/api/', limiter);

  // Parse JSON payloads
  app.use(express.json({ limit: '1mb' }));

  // Health Endpoint
  app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'phoenix-drop-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // API Routes
  app.use('/api/rooms', roomRouter);

  // Socket.IO Setup
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket', 'polling']
  });

  setupSignaling(io);

  return { app, server, io };
}

// Start server if run directly
const isMain = process.argv[1] && (
  fileURLToPath(import.meta.url) === process.argv[1] ||
  process.argv[1].endsWith('dist/index.js') ||
  process.argv[1].endsWith('src/index.ts')
);

if (isMain && process.env.NODE_ENV !== 'test') {
  const { server } = createApp();
  startCleanupService();

  server.listen(config.port, () => {
    console.log(`[Phoenix Drop API] Server active on port ${config.port}`);
    console.log(`[Phoenix Drop API] Environment: ${config.nodeEnv}`);
    console.log(`[Phoenix Drop API] STUN Servers configured: ${config.stunServers.length}`);
  });
}
