import { 
  CreateRoomInput, 
  RoomMetadata, 
  RoomSettings 
} from '@phoenix-drop/shared';

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface CreateRoomResponse {
  room: RoomMetadata;
  hostToken: string;
  participantToken: string;
  participantId: string;
}

export interface GetRoomResponse {
  room: RoomMetadata;
  isLocked: boolean;
  isPasswordProtected: boolean;
  isFull: boolean;
}

export const api = {
  async createRoom(data: CreateRoomInput): Promise<CreateRoomResponse> {
    const res = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create room' }));
      throw new Error(err.error || 'Failed to create room');
    }
    return res.json();
  },

  async getRoom(idOrCode: string): Promise<GetRoomResponse> {
    const res = await fetch(`${API_BASE}/api/rooms/${idOrCode}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Room not found' }));
      throw new Error(err.error || 'Room not found');
    }
    return res.json();
  },

  async verifyPassword(roomId: string, password: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/api/rooms/${roomId}/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body.valid);
  },

  async updateSettings(
    roomId: string, 
    hostToken: string, 
    settings: Partial<RoomSettings>, 
    name?: string
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/api/rooms/${roomId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, hostToken, settings, name })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Update failed' }));
      throw new Error(err.error || 'Failed to update room settings');
    }
  },

  async executeHostAction(
    roomId: string, 
    hostToken: string, 
    action: 'lock' | 'unlock' | 'kick_participant' | 'transfer_host' | 'delete_room',
    targetParticipantId?: string
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/api/rooms/${roomId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, hostToken, action, targetParticipantId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Action failed' }));
      throw new Error(err.error || 'Host action failed');
    }
  }
};
