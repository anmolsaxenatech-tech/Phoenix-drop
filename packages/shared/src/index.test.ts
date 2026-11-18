import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  packChunk, 
  unpackChunk, 
  uuidToBytes, 
  bytesToUuid, 
  sanitizeFilename, 
  generateRoomCode, 
  formatBytes,
  CreateRoomSchema,
  JoinRoomSchema
} from './index.js';

describe('Shared Protocol & Utilities', () => {
  it('should convert UUIDs to 16 bytes and back accurately', () => {
    const originalUuid = 'c028ea11-66c3-42e5-bc09-b4618765275e';
    const bytes = uuidToBytes(originalUuid);
    assert.equal(bytes.length, 16);
    const converted = bytesToUuid(bytes);
    assert.equal(converted.toLowerCase(), originalUuid.toLowerCase());
  });

  it('should correctly pack and unpack chunks with binary headers', () => {
    const fileId = '123e4567-e89b-12d3-a456-426614174000';
    const chunkIndex = 42;
    const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const packed = packChunk(fileId, chunkIndex, testData.buffer);
    assert.equal(packed.byteLength, 24 + 10);

    const unpacked = unpackChunk(packed);
    assert.equal(unpacked.valid, true);
    assert.equal(unpacked.fileId.toLowerCase(), fileId.toLowerCase());
    assert.equal(unpacked.chunkIndex, 42);

    const payloadBytes = new Uint8Array(unpacked.payload);
    assert.deepEqual(Array.from(payloadBytes), Array.from(testData));
  });

  it('should reject malformed or truncated chunk buffers', () => {
    const smallBuffer = new ArrayBuffer(10);
    const result = unpackChunk(smallBuffer);
    assert.equal(result.valid, false);
  });

  it('should sanitize dangerous filenames properly', () => {
    const dangerous = '../../../etc/passwd\x00.exe';
    const sanitized = sanitizeFilename(dangerous);
    assert.equal(sanitized.includes('..'), false);
    assert.equal(sanitized.includes('\x00'), false);
    assert.equal(sanitized.includes('/'), false);
  });

  it('should generate valid 6-character room codes', () => {
    const code = generateRoomCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  });

  it('should format bytes accurately', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1048576), '1 MB');
    assert.equal(formatBytes(1073741824), '1 GB');
  });

  it('should validate CreateRoomSchema and JoinRoomSchema', () => {
    const validCreate = CreateRoomSchema.safeParse({
      name: 'Team Drop',
      displayName: 'Alice'
    });
    assert.equal(validCreate.success, true);

    const validJoin = JoinRoomSchema.safeParse({
      roomCode: 'ABCDEF',
      displayName: 'Bob'
    });
    assert.equal(validJoin.success, true);
  });
});
