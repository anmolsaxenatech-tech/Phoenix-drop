# Phoenix Drop Security & Privacy Report

## 1. Authentication & Tokens

- **Ephemeral Room IDs**: Generated using standard UUID v4 or 6-character unambiguous alphanumeric codes (excluding confusing characters like 0, O, 1, I, L).
- **Host Secret Tokens**: 32-byte cryptographically secure random tokens generated with `crypto.randomBytes(32)`.
- **Token Hashing**: The database and in-memory store never store plaintext host tokens; they store SHA-256 hashes of host tokens (`hostTokenHash`). Even if read-access to the database occurred, host tokens cannot be recovered.
- **Room Passwords**: Salted hashes computed with PBKDF2 (SHA-512, 100,000 iterations) and verified with `crypto.timingSafeEqual` to eliminate timing attack vectors.

## 2. Injection & Traversal Defense

- **Filename Sanitization**: Untrusted filenames received from peers or clients are sanitized by removing path traversal characters (`..`, `/`, `\`), null bytes (`\x00`), and control codes.
- **Safe DOM Rendering**: File preview avoids any `dangerouslySetInnerHTML`. Text files are rendered as pure text nodes (`whitespace-pre-wrap`), images use safe object URLs, and code is safely escaped.
- **HTTP Security Headers**: Express uses `helmet` for secure response headers and `cors` for origin isolation.

## 3. Rate Limiting & Abuse Prevention

- **API Rate Limiter**: 200 requests per 15 minutes per IP address via `express-rate-limit`.
- **Chat Rate Limiter**: Maximum 30 messages per minute per participant on Socket.IO connections. Messages over 1000 characters are rejected.
- **Capacity Enforcements**: Room participant caps (default 10, max 16) are enforced both on the REST API and in the Socket.IO signaling broker.

## 4. Privacy & Anonymity Disclosure

- Direct peer-to-peer WebRTC connections expose local or public IP addresses between connected peers as part of standard ICE discovery.
- Phoenix Drop **does not claim** to provide anonymous or onion-routed transfers. Peers in the same room can discover each other's IP address through WebRTC candidate exchange.
- Audit logs record masked IP addresses (`192.168.*.*`) to protect privacy while preserving operational security logs.
