import { DEFAULT_STUN_SERVERS } from '@phoenix-drop/shared';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  databaseUrl: process.env.DATABASE_URL || '',
  stunServers: process.env.STUN_SERVERS 
    ? process.env.STUN_SERVERS.split(',').map(url => ({ urls: url.trim() }))
    : DEFAULT_STUN_SERVERS,
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || 'phoenix-drop-files',
    publicUrl: process.env.R2_PUBLIC_URL || '',
    endpoint: process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')
  }
};
