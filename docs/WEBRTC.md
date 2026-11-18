# WebRTC DataChannel Transfer Engine Specification

## 1. Dual Channel Architecture

Every direct peer connection allocates two dedicated `RTCDataChannel` instances:

1. **`phoenix-control`** (Reliable, Ordered):
   - Protocol: JSON control signaling.
   - Purpose: Handshake negotiation, pause/resume signaling, cancellation, completion verification.
   - Messages:
     - `FILE_OFFER`: Contains fileId, fileName, fileSize, totalChunks, chunkSize, sha256 checksum.
     - `FILE_ACCEPT`: Informs sender to begin chunk transmission.
     - `TRANSFER_PAUSE`: Pauses chunk transmission.
     - `TRANSFER_RESUME`: Resumes chunk transmission from specified chunk index.
     - `TRANSFER_CANCEL`: Terminates transfer immediately.
     - `TRANSFER_COMPLETE`: Mutual completion confirmation.

2. **`phoenix-data`** (Reliable, Binary):
   - Protocol: High-performance PDCK 24-byte binary framed chunks.
   - Binary Frame Structure:
     - Bytes 0..3: Magic bytes `0x5044434b` ("PDCK")
     - Bytes 4..19: File UUID in binary (16 bytes)
     - Bytes 20..23: Chunk Index (Uint32 big-endian)
     - Bytes 24..end: Chunk payload (default 64 KB)

## 2. Adaptive Backpressure Control

To prevent memory exhaustion, network buffer crashes, or tab crashes when sending large files (up to 10 GB):

```typescript
// Sender backpressure loop
if (dataChannel.bufferedAmount > HIGH_WATER_MARK) { // 1 MB
  await new Promise<void>((resolve) => {
    const onLow = () => {
      dataChannel.removeEventListener('bufferedamountlow', onLow);
      resolve();
    };
    dataChannel.addEventListener('bufferedamountlow', onLow);
  });
}
```

## 3. Cryptographic Verification

- Before transmission, the sender calculates the file's SHA-256 hash using the native Web Crypto API (`crypto.subtle.digest`).
- The receiver reassembles received chunks and recalculates the SHA-256 checksum before unlocking download or preview.
- If checksum verification fails, the transfer is marked `failed` with an explicit integrity mismatch error.

## 4. Controlled Fan-Out

In multi-participant rooms (up to 10 peers):
- Concurrency limit: Sender restricts simultaneous outgoing file transmissions to `MAX_CONCURRENT_OUTGOING_TRANSFERS = 3`.
- Remaining recipients are queued to conserve sender upload bandwidth and prevent network congestion.
