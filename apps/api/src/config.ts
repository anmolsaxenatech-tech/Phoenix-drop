import { DEFAULT_STUN_SERVERS } from '@phoenix-drop/shared';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  databaseUrl: process.env.DATABASE_URL || '',
  stunServers: process.env.STUN_SERVERS 
    ? process.env.STUN_SERVERS.split(',').map(url => ({ urls: url.trim() }))
    : DEFAULT_STUN_SERVERS
};
