/**
 * PHOENIX DROP - Common Utilities
 */

/**
 * Sanitizes an untrusted filename to prevent path traversal,
 * control character injection, or dangerous executable extensions.
 */
export function sanitizeFilename(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    return 'unnamed-file';
  }

  // Strip path traversal and path separators
  let name = raw.replace(/[/\\?%*:|"<>]/g, '_').trim();

  // Strip null bytes and control characters
  name = name.replace(/[\x00-\x1f\x80-\x9f]/g, '');

  // Strip relative traversal dots (e.g. .. or ...)
  name = name.replace(/\.{2,}/g, '_');

  // Remove leading dots or hyphens
  name = name.replace(/^[.-]+/, '');

  // Truncate to 200 characters max
  if (name.length > 200) {
    const ext = getFileExtension(name);
    const base = name.slice(0, 190);
    name = ext ? `${base}.${ext}` : base;
  }

  return name || 'unnamed-file';
}

/**
 * Extracts lowercase file extension without dot
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()?.toLowerCase() || '';
}

/**
 * Formats bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Formats transfer speed (Bytes per second)
 */
export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

/**
 * Formats ETA seconds into human-readable duration
 */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  if (seconds === 0) return '0s';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Generates an unambiguous 6-character room code (avoiding 0, O, 1, I, L)
 */
const ROOM_CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function generateRoomCode(): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    result += ROOM_CODE_CHARS[randomIndex];
  }
  return result;
}

/**
 * Categorizes a MIME type / filename into a high-level preview type
 */
export type PreviewCategory = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'document' | 'other';

export function getPreviewCategory(mimeType: string, filename: string): PreviewCategory {
  const lowerMime = (mimeType || '').toLowerCase();
  const ext = getFileExtension(filename);

  if (lowerMime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  }
  if (lowerMime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) {
    return 'video';
  }
  if (lowerMime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (lowerMime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (lowerMime.startsWith('text/') || ['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml'].includes(ext)) {
    return 'text';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return 'archive';
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    return 'document';
  }
  return 'other';
}
