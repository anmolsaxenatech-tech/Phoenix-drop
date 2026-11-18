import { RoomRepository } from '../db.js';

/**
 * PHOENIX DROP - Background Room Cleanup Service
 * Automatically clears expired rooms and releases resources.
 */
export function startCleanupService(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const count = await RoomRepository.cleanupExpiredRooms();
      if (count > 0) {
        console.log(`[Cleanup] Successfully purged ${count} expired room(s).`);
      }
    } catch (err) {
      console.error('[Cleanup] Error during room cleanup:', err);
    }
  }, intervalMs);

  timer.unref();

  return timer;
}
