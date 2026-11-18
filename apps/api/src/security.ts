import crypto from 'node:crypto';

/**
 * PHOENIX DROP - Security & Cryptographic Utilities
 */

/**
 * Generates a high-entropy cryptographically secure random token (64 hex chars = 32 bytes)
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a token using SHA-256 for secure database storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Secure password hashing using PBKDF2 with SHA-512 and 100,000 iterations.
 * Zero external binary dependencies required, resistant to brute force & timing attacks.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against a stored hash in constant time to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, key] = parts;
  return new Promise((resolve) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) return resolve(false);
      const keyBuffer = Buffer.from(key, 'hex');
      const match = crypto.timingSafeEqual(derivedKey, keyBuffer);
      resolve(match);
    });
  });
}

/**
 * Masks an IP address for privacy-conscious audit logs (IPv4: 192.168.x.x, IPv6: 2001:db8::)
 */
export function maskIp(ip?: string): string {
  if (!ip) return 'unknown';
  if (ip.includes(':')) {
    // IPv6: keep first 3 segments
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}::****`;
  }
  // IPv4: keep first 2 segments
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return 'anonymized';
}
