/**
 * PHOENIX DROP - Core Constants
 * Zero-infrastructure, free-tier optimized defaults.
 */

// File Transfer Limits
export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB per chunk (safest across mobile WebRTC DataChannels)
export const MAX_CHUNK_SIZE = 256 * 1024; // 256 KB max
export const MIN_CHUNK_SIZE = 16 * 1024; // 16 KB min

// Default max file size is 10 GB (configured maximum subject to client memory/storage)
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB
export const MOBILE_WARN_FILE_SIZE = 500 * 1024 * 1024; // 500 MB warning on mobile devices

// Room defaults
export const DEFAULT_MAX_PARTICIPANTS = 10;
export const ABSOLUTE_MAX_PARTICIPANTS = 16;
export const DEFAULT_ROOM_EXPIRATION_HOURS = 24;
export const MAX_ROOM_EXPIRATION_HOURS = 72;

// Public Best-Effort STUN servers (STRICTLY FREE, NO TURN BY DEFAULT)
export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

// WebRTC DataChannel Backpressure
export const HIGH_WATER_MARK = 1024 * 1024; // 1 MB: pause sender when bufferedAmount exceeds this
export const LOW_WATER_MARK = 256 * 1024; // 256 KB: resume sender when bufferedAmount drops below this

// Max concurrent recipient transfers from a single sender to preserve upload bandwidth
export const MAX_CONCURRENT_OUTGOING_TRANSFERS = 3;

// Chat limits
export const MAX_CHAT_MESSAGE_LENGTH = 1000;
export const CHAT_RATE_LIMIT_PER_MINUTE = 30;

// Token & Code lengths
export const ROOM_CODE_LENGTH = 6;
export const TOKEN_BYTES = 32;
