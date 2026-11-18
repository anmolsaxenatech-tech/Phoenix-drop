/**
 * PHOENIX DROP - Core Type Definitions
 */

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface ParticipantInfo {
  id: string;
  socketId: string;
  displayName: string;
  isHost: boolean;
  joinedAt: string;
  deviceType: DeviceType;
  browser?: string;
  connectionState: ConnectionState;
}

export interface RoomSettings {
  maxParticipants: number;
  maxFileSize: number; // in bytes
  allowedExtensions: string[]; // empty array means all allowed
  uploadsEnabled: boolean;
  downloadsEnabled: boolean;
  chatEnabled: boolean;
  isLocked: boolean;
  expirationHours: number;
}

export interface RoomMetadata {
  id: string; // Cryptographic UUID or nanoid
  code: string; // 6-character human-friendly uppercase code
  name: string;
  createdAt: string;
  expiresAt: string;
  hostId: string;
  isClosed?: boolean;
  isPasswordProtected?: boolean;
  settings: RoomSettings;
  participants: ParticipantInfo[];
}

export interface HostAuthPayload {
  roomId: string;
  hostToken: string;
}

export interface ParticipantAuthPayload {
  roomId: string;
  participantId: string;
  participantToken: string;
}

// Chat types
export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  isHost: boolean;
  isSystem: boolean;
  content: string;
  timestamp: string;
}

// File Transfer Metadata
export type TransferState = 
  | 'idle'
  | 'preparing'
  | 'negotiating'
  | 'transferring'
  | 'paused'
  | 'verifying'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface FileMetadata {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
  chunkSize: number;
  sha256: string;
  senderId: string;
  senderName: string;
  createdAt: string;
}

export interface TransferProgress {
  fileId: string;
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  chunksCompleted: number;
  totalChunks: number;
  percentage: number;
  speedBps: number;
  etaSeconds: number;
  state: TransferState;
  error?: string;
  peerId: string;
}

export interface PeerTransferStatus {
  peerId: string;
  displayName: string;
  state: TransferState;
  percentage: number;
  speedBps: number;
  etaSeconds: number;
  error?: string;
}

// Signaling Messages
export interface SignalJoinPayload {
  roomId: string;
  displayName: string;
  roomCode?: string;
  deviceType: DeviceType;
}

export interface SignalJoinedResponse {
  room: RoomMetadata;
  self: ParticipantInfo;
  participantToken: string;
  hostToken?: string; // only provided to room creator
  iceServers: RTCIceServer[];
}

export interface SignalOfferPayload {
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalAnswerPayload {
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalIceCandidatePayload {
  targetPeerId: string;
  candidate: RTCIceCandidateInit;
}

export interface RoomActivityLog {
  id: string;
  roomId: string;
  type: 'participant_joined' | 'participant_left' | 'file_shared' | 'file_downloaded' | 'settings_updated' | 'room_locked' | 'room_closed' | 'host_transferred';
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
