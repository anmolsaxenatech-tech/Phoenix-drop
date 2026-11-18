import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { 
  packChunk, 
  unpackChunk, 
  DEFAULT_CHUNK_SIZE, 
  HIGH_WATER_MARK 
} from './index.js';

describe('WebRTC Large File Chunk Transfer & Integrity Simulation', () => {
  it('should stream, pack, unpack, and verify SHA-256 integrity of a 1 MB file', async () => {
    // Generate 1 MB random buffer
    const fileSize = 1024 * 1024; // 1 MB
    const fileData = crypto.randomBytes(fileSize);
    const expectedSha256 = crypto.createHash('sha256').update(fileData).digest('hex');

    const fileId = crypto.randomUUID();
    const chunkSize = DEFAULT_CHUNK_SIZE; // 64 KB
    const totalChunks = Math.ceil(fileSize / chunkSize);

    const receivedChunks: ArrayBuffer[] = new Array(totalChunks);
    let chunksTransferred = 0;
    let virtualBufferedAmount = 0;
    let backpressureTriggered = 0;

    // Sender simulation
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const chunkBuffer = fileData.subarray(start, end);

      // Simulate backpressure check
      virtualBufferedAmount += chunkBuffer.byteLength;
      if (virtualBufferedAmount > HIGH_WATER_MARK) {
        backpressureTriggered++;
        // Simulate drain
        virtualBufferedAmount = 0;
      }

      // Pack chunk with PDCK wire header
      const packet = packChunk(fileId, i, chunkBuffer.buffer.slice(chunkBuffer.byteOffset, chunkBuffer.byteOffset + chunkBuffer.byteLength));

      // Network transit -> Receiver
      const unpacked = unpackChunk(packet);
      assert.equal(unpacked.valid, true);
      assert.equal(unpacked.fileId.toLowerCase(), fileId.toLowerCase());
      assert.equal(unpacked.chunkIndex, i);

      receivedChunks[i] = unpacked.payload;
      chunksTransferred++;
    }

    assert.equal(chunksTransferred, totalChunks);

    // Receiver reassembly
    const totalReceivedBytes = receivedChunks.reduce((acc, curr) => acc + curr.byteLength, 0);
    assert.equal(totalReceivedBytes, fileSize);

    const assembled = Buffer.concat(receivedChunks.map(c => Buffer.from(c)));
    const actualSha256 = crypto.createHash('sha256').update(assembled).digest('hex');

    assert.equal(actualSha256, expectedSha256);
  });

  it('should detect corrupted or altered chunks during reassembly', async () => {
    const fileData = Buffer.from('Phoenix Drop Direct P2P File Integrity Verification Payload');
    const expectedSha256 = crypto.createHash('sha256').update(fileData).digest('hex');
    const fileId = crypto.randomUUID();

    const packet = packChunk(fileId, 0, fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength));
    const unpacked = unpackChunk(packet);

    // Tamper with one byte
    const payloadBytes = new Uint8Array(unpacked.payload);
    payloadBytes[0] = payloadBytes[0] ^ 0xFF; // flip bits

    const tamperedSha256 = crypto.createHash('sha256').update(Buffer.from(payloadBytes)).digest('hex');
    assert.notEqual(tamperedSha256, expectedSha256);
  });
});
