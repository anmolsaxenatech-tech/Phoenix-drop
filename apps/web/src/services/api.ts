import { 
  CreateRoomInput, 
  RoomMetadata, 
  RoomSettings,
  StoredFile,
  FileListResponse,
  RoomActivityLog
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
  isClosed?: boolean;
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
    action: 'lock' | 'unlock' | 'kick_participant' | 'transfer_host' | 'delete_room' | 'close_room',
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
  },

  getDownloadUrl(roomId: string, token: string, fileId: string): string {
    return `${API_BASE}/api/rooms/${roomId}/files/${fileId}/download?token=${encodeURIComponent(token)}`;
  },

  async getFiles(
    roomId: string, 
    token: string, 
    options?: { page?: number; limit?: number; q?: string; sort?: string; type?: string }
  ): Promise<FileListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.q) params.set('q', options.q);
    if (options?.sort) params.set('sort', options.sort);
    if (options?.type) params.set('type', options.type);

    const res = await fetch(`${API_BASE}/api/rooms/${roomId}/files?${params.toString()}`, {
      headers: {
        'X-Participant-Token': token
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch files' }));
      throw new Error(err.error || 'Failed to fetch files');
    }
    return res.json();
  },

  async uploadFile(roomId: string, token: string, file: File, sha256 = ''): Promise<StoredFile> {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per part
    if (file.size <= CHUNK_SIZE) {
      // Direct upload
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i += 8192) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + 8192, len))));
      }
      const base64 = btoa(binary);

      const res = await fetch(`${API_BASE}/api/rooms/${roomId}/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Participant-Token': token
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          content: base64,
          sha256
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Failed to upload file');
      }
      const data = await res.json();
      return data.file;
    }

    // Multipart upload for large files (10 GB capable)
    const initRes = await fetch(`${API_BASE}/api/rooms/${roomId}/files/multipart/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Participant-Token': token
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        sha256
      })
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({ error: 'Initiate failed' }));
      throw new Error(err.error || 'Failed to initiate multipart upload');
    }

    const { fileId, uploadId, storageKey } = await initRes.json();
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    const completedParts: { partNumber: number; eTag: string }[] = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const slice = file.slice(start, end);
      const buf = await slice.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + 8192, bytes.length))));
      }
      const base64 = btoa(binary);

      const partRes = await fetch(`${API_BASE}/api/rooms/${roomId}/files/multipart/part`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Participant-Token': token
        },
        body: JSON.stringify({
          uploadId,
          storageKey,
          partNumber,
          content: base64
        })
      });

      if (!partRes.ok) {
        await fetch(`${API_BASE}/api/rooms/${roomId}/files/multipart/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Participant-Token': token },
          body: JSON.stringify({ uploadId, storageKey })
        }).catch(() => {});
        throw new Error(`Failed to upload part ${partNumber}`);
      }

      const partData = await partRes.json();
      completedParts.push({ partNumber, eTag: partData.eTag });
    }

    // Complete multipart
    const compRes = await fetch(`${API_BASE}/api/rooms/${roomId}/files/multipart/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Participant-Token': token
      },
      body: JSON.stringify({
        fileId,
        uploadId,
        storageKey,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        sha256,
        parts: completedParts
      })
    });

    if (!compRes.ok) {
      const err = await compRes.json().catch(() => ({ error: 'Completion failed' }));
      throw new Error(err.error || 'Failed to complete multipart upload');
    }

    const compData = await compRes.json();
    return compData.file;
  },

  async deleteFile(roomId: string, token: string, fileId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/rooms/${roomId}/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'X-Participant-Token': token
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Delete failed' }));
      throw new Error(err.error || 'Failed to delete file');
    }
  },

  async getActivities(roomId: string, token: string): Promise<RoomActivityLog[]> {
    const res = await fetch(`${API_BASE}/api/rooms/${roomId}/activities`, {
      headers: {
        'X-Participant-Token': token
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch activities' }));
      throw new Error(err.error || 'Failed to fetch activities');
    }
    const data = await res.json();
    return data.activities || [];
  }
};
