/**
 * PHOENIX DROP - WebRTC DataChannel Wire Protocol
 * High-performance, zero-overhead chunk framing for direct peer-to-peer transfers.
 */

import { FileMetadata } from './types.js';

export const PROTOCOL_MAGIC = 0x5044434b; // "PDCK" in ASCII (Phoenix Drop Chunk)
export const HEADER_SIZE = 24; // 4 magic + 16 UUID + 4 chunk index

export type ControlMessageType =
  | 'FILE_OFFER'
  | 'FILE_ACCEPT'
  | 'FILE_REJECT'
  | 'CHUNK_ACK'
  | 'TRANSFER_PAUSE'
  | 'TRANSFER_RESUME'
  | 'TRANSFER_CANCEL'
  | 'TRANSFER_COMPLETE';

export interface FileOfferMessage {
  type: 'FILE_OFFER';
  file: FileMetadata;
}

export interface FileAcceptMessage {
  type: 'FILE_ACCEPT';
  fileId: string;
  startChunkIndex: number;
}

export interface FileRejectMessage {
  type: 'FILE_REJECT';
  fileId: string;
  reason: string;
}

export interface ChunkAckMessage {
  type: 'CHUNK_ACK';
  fileId: string;
  chunkIndex: number;
}

export interface TransferPauseMessage {
  type: 'TRANSFER_PAUSE';
  fileId: string;
}

export interface TransferResumeMessage {
  type: 'TRANSFER_RESUME';
  fileId: string;
  fromChunkIndex: number;
}

export interface TransferCancelMessage {
  type: 'TRANSFER_CANCEL';
  fileId: string;
  reason?: string;
}

export interface TransferCompleteMessage {
  type: 'TRANSFER_COMPLETE';
  fileId: string;
  verified: boolean;
  sha256?: string;
}

export type ControlMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | ChunkAckMessage
  | TransferPauseMessage
  | TransferResumeMessage
  | TransferCancelMessage
  | TransferCompleteMessage;

/**
 * Converts a standard UUID string (36 chars with dashes) to 16 bytes Uint8Array
 */
export function uuidToBytes(uuid: string): Uint8Array {
  const clean = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16) || 0;
  }
  return bytes;
}

/**
 * Converts 16 bytes Uint8Array back to standard UUID string
 */
export function bytesToUuid(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Packs a binary chunk with standard 24-byte header:
 * [0..3]   Magic 0x5044434B
 * [4..19]  File UUID (16 bytes)
 * [20..23] Chunk Index (uint32)
 * [24..N]  Payload bytes
 */
export function packChunk(fileId: string, chunkIndex: number, payload: ArrayBuffer): ArrayBuffer {
  const totalLength = HEADER_SIZE + payload.byteLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // Magic
  view.setUint32(0, PROTOCOL_MAGIC, false); // Big endian

  // 16-byte UUID
  const uuidBytes = uuidToBytes(fileId);
  new Uint8Array(buffer, 4, 16).set(uuidBytes);

  // Chunk Index
  view.setUint32(20, chunkIndex, false); // Big endian

  // Payload
  new Uint8Array(buffer, HEADER_SIZE).set(new Uint8Array(payload));

  return buffer;
}

/**
 * Unpacks received binary buffer into chunkIndex, fileId, and raw payload.
 */
export function unpackChunk(buffer: ArrayBuffer): {
  valid: boolean;
  fileId: string;
  chunkIndex: number;
  payload: ArrayBuffer;
} {
  if (buffer.byteLength < HEADER_SIZE) {
    return { valid: false, fileId: '', chunkIndex: -1, payload: new ArrayBuffer(0) };
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, false);
  if (magic !== PROTOCOL_MAGIC) {
    return { valid: false, fileId: '', chunkIndex: -1, payload: new ArrayBuffer(0) };
  }

  const uuidBytes = new Uint8Array(buffer, 4, 16);
  const fileId = bytesToUuid(uuidBytes);
  const chunkIndex = view.getUint32(20, false);
  const payload = buffer.slice(HEADER_SIZE);

  return {
    valid: true,
    fileId,
    chunkIndex,
    payload
  };
}
