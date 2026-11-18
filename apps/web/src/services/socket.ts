import { io, Socket } from 'socket.io-client';
import { 
  SignalJoinPayload, 
  ChatMessage, 
  FileMetadata, 
  RoomSettings, 
  RoomMetadata, 
  ParticipantInfo,
  StoredFile,
  RoomActivityLog
} from '@phoenix-drop/shared';

const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;

export interface JoinRoomResult {
  success?: boolean;
  error?: string;
  requiresPassword?: boolean;
  room?: RoomMetadata;
  self?: ParticipantInfo;
  participantToken?: string;
  iceServers?: RTCIceServer[];
  existingFiles?: StoredFile[];
  activities?: RoomActivityLog[];
}

export class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });

      this.socket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
      });
    }
    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  joinRoom(payload: SignalJoinPayload): Promise<JoinRoomResult> {
    const s = this.connect();
    return new Promise((resolve) => {
      s.emit('room:join', payload, (res: JoinRoomResult) => {
        resolve(res);
      });
    });
  }

  sendChatMessage(content: string): Promise<{ success?: boolean; error?: string }> {
    if (!this.socket) return Promise.reject(new Error('Socket disconnected'));
    return new Promise((resolve) => {
      this.socket?.emit('chat:send', { content }, (res: { success?: boolean; error?: string }) => {
        resolve(res);
      });
    });
  }

  announceTransfer(metadata: FileMetadata): Promise<{ success?: boolean; error?: string }> {
    if (!this.socket) return Promise.reject(new Error('Socket disconnected'));
    return new Promise((resolve) => {
      this.socket?.emit('transfer:announce', metadata, (res: { success?: boolean; error?: string }) => {
        resolve(res);
      });
    });
  }

  sendSignalOffer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.socket?.emit('signal:offer', { targetPeerId, sdp });
  }

  sendSignalAnswer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.socket?.emit('signal:answer', { targetPeerId, sdp });
  }

  sendSignalIceCandidate(targetPeerId: string, candidate: RTCIceCandidateInit): void {
    this.socket?.emit('signal:ice_candidate', { targetPeerId, candidate });
  }

  kickParticipant(targetPeerId: string, hostToken: string): void {
    this.socket?.emit('host:kick', { targetPeerId, hostToken });
  }

  updateSettings(settings: Partial<RoomSettings>, hostToken: string, name?: string): void {
    this.socket?.emit('host:update_settings', { settings, hostToken, name });
  }

  closeRoom(hostToken: string): Promise<{ success?: boolean; error?: string }> {
    if (!this.socket) return Promise.reject(new Error('Socket disconnected'));
    return new Promise((resolve) => {
      this.socket?.emit('host:close_room', { hostToken }, (res: { success?: boolean; error?: string }) => {
        resolve(res);
      });
    });
  }

  leaveRoom(): Promise<void> {
    if (!this.socket) return Promise.resolve();
    return new Promise((resolve) => {
      this.socket?.emit('room:leave', () => {
        this.disconnect();
        resolve();
      });
      setTimeout(() => {
        this.disconnect();
        resolve();
      }, 500);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
