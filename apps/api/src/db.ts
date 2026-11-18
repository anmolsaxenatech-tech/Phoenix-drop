import { PrismaClient } from '@prisma/client';
import { 
  RoomMetadata, 
  RoomSettings, 
  ParticipantInfo, 
  ChatMessage, 
  RoomActivityLog, 
  FileMetadata,
  StoredFile 
} from '@phoenix-drop/shared';
import { config } from './config.js';
import { hashToken } from './security.js';
import { storageService } from './services/storage.js';

let prismaInstance: PrismaClient | null = null;
let isPrismaAvailable = false;

if (config.databaseUrl) {
  try {
    prismaInstance = new PrismaClient();
    isPrismaAvailable = true;
  } catch (err) {
    console.warn('[DB] Prisma client initialization skipped. Using in-memory fallback store.', err);
  }
}

export const prisma = prismaInstance;

// In-memory fallback state to ensure 100% operational testing even without external Postgres
interface MemoryRoom {
  id: string;
  code: string;
  name: string;
  passwordHash?: string;
  hostTokenHash: string;
  isLocked: boolean;
  isClosed: boolean;
  createdAt: Date;
  expiresAt: Date;
  settings: RoomSettings;
  participants: Map<string, ParticipantInfo & { participantToken: string }>;
  messages: ChatMessage[];
  activities: RoomActivityLog[];
  files: Map<string, StoredFile>;
  transfers: Map<string, FileMetadata & { status: string }>;
}

const memoryRooms = new Map<string, MemoryRoom>();
const codeToRoomId = new Map<string, string>();

export class RoomRepository {
  static async createRoom(data: {
    id: string;
    code: string;
    name: string;
    passwordHash?: string;
    hostTokenHash: string;
    expiresAt: Date;
    settings: RoomSettings;
  }): Promise<void> {
    const memoryRoom: MemoryRoom = {
      id: data.id,
      code: data.code,
      name: data.name,
      passwordHash: data.passwordHash,
      hostTokenHash: data.hostTokenHash,
      isLocked: data.settings.isLocked,
      isClosed: false,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
      settings: data.settings,
      participants: new Map(),
      messages: [],
      activities: [],
      files: new Map(),
      transfers: new Map()
    };

    memoryRooms.set(data.id, memoryRoom);
    codeToRoomId.set(data.code.toUpperCase(), data.id);

    if (isPrismaAvailable && prisma) {
      try {
        await prisma.room.create({
          data: {
            id: data.id,
            code: data.code,
            name: data.name,
            passwordHash: data.passwordHash || null,
            hostTokenHash: data.hostTokenHash,
            isLocked: data.settings.isLocked,
            expiresAt: data.expiresAt,
            settings: {
              create: {
                maxParticipants: data.settings.maxParticipants,
                maxFileSize: BigInt(data.settings.maxFileSize),
                allowedExtensions: data.settings.allowedExtensions.join(','),
                uploadsEnabled: data.settings.uploadsEnabled,
                downloadsEnabled: data.settings.downloadsEnabled,
                chatEnabled: data.settings.chatEnabled,
                expirationHours: data.settings.expirationHours
              }
            }
          }
        });
      } catch (err) {
        console.warn('[DB] Prisma createRoom failed, persisted in memory:', err);
      }
    }
  }

  static async findById(id: string): Promise<MemoryRoom | null> {
    const room = memoryRooms.get(id);
    if (!room) return null;
    if (new Date() > room.expiresAt) {
      this.deleteRoom(id);
      return null;
    }
    return room;
  }

  static async findByCode(code: string): Promise<MemoryRoom | null> {
    const id = codeToRoomId.get(code.toUpperCase());
    if (!id) return null;
    return this.findById(id);
  }

  static async addParticipant(roomId: string, participant: ParticipantInfo & { participantToken: string }): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) return;
    room.participants.set(participant.id, participant);
  }

  static async removeParticipant(roomId: string, participantId: string): Promise<{ newHostId?: string; wasHost: boolean }> {
    const room = await this.findById(roomId);
    if (!room) return { wasHost: false };
    const p = room.participants.get(participantId);
    const wasHost = Boolean(p?.isHost);
    room.participants.delete(participantId);

    // If leaving participant was the host and other participants remain,
    // automatically elect the oldest remaining participant as the new host
    let newHostId: string | undefined = undefined;
    if (wasHost && room.participants.size > 0) {
      const remaining = Array.from(room.participants.values());
      const nextHost = remaining[0];
      nextHost.isHost = true;
      newHostId = nextHost.id;
    }

    return { wasHost, newHostId };
  }

  static async closeRoom(id: string): Promise<void> {
    const room = memoryRooms.get(id);
    if (room) {
      room.isClosed = true;
      room.isLocked = true;
      room.settings.isLocked = true;
      room.settings.uploadsEnabled = false;
      room.settings.downloadsEnabled = false;
    }
  }

  static async updateSettings(roomId: string, newSettings: Partial<RoomSettings>, newName?: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) return;
    if (newName) room.name = newName;
    room.settings = { ...room.settings, ...newSettings };
    room.isLocked = room.settings.isLocked;
  }

  static async addChatMessage(roomId: string, message: ChatMessage): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) return;
    room.messages.push(message);
    if (room.messages.length > 500) {
      room.messages.shift();
    }
  }

  static async addActivity(roomId: string, activity: RoomActivityLog): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) return;
    room.activities.push(activity);
    if (room.activities.length > 500) {
      room.activities.shift();
    }

    if (isPrismaAvailable && prisma) {
      try {
        await prisma.roomActivity.create({
          data: {
            id: activity.id,
            roomId,
            type: activity.type,
            description: activity.description,
            metadata: activity.metadata ? JSON.stringify(activity.metadata) : null,
            createdAt: new Date(activity.timestamp)
          }
        });
      } catch (err) {
        // Ignored fallback
      }
    }
  }

  static async getActivities(roomId: string): Promise<RoomActivityLog[]> {
    const room = await this.findById(roomId);
    if (!room) return [];
    return [...room.activities];
  }

  static async saveFile(file: StoredFile): Promise<void> {
    const room = await this.findById(file.roomId);
    if (!room) return;
    room.files.set(file.fileId, { ...file, isDeleted: false });

    if (isPrismaAvailable && prisma) {
      try {
        await prisma.transferMetadata.upsert({
          where: { fileId: file.fileId },
          update: {
            fileName: file.fileName,
            fileSize: BigInt(file.fileSize),
            fileType: file.fileType,
            sha256: file.sha256 || '',
            storageKey: file.storageKey || null,
            status: 'completed',
            isDeleted: false,
            completedAt: new Date()
          },
          create: {
            id: file.fileId,
            roomId: file.roomId,
            fileId: file.fileId,
            fileName: file.fileName,
            fileSize: BigInt(file.fileSize),
            fileType: file.fileType,
            totalChunks: 1,
            chunkSize: 65536,
            sha256: file.sha256 || '',
            senderId: file.senderId,
            senderName: file.senderName,
            status: 'completed',
            storageKey: file.storageKey || null,
            isDeleted: false,
            createdAt: new Date(file.createdAt),
            completedAt: new Date()
          }
        });
      } catch (err) {
        // Ignored fallback
      }
    }
  }

  static async getFile(roomId: string, fileId: string): Promise<StoredFile | null> {
    const room = await this.findById(roomId);
    if (!room) return null;
    const file = room.files.get(fileId);
    if (!file || file.isDeleted) return null;
    return file;
  }

  static async listFiles(
    roomId: string, 
    options: { page?: number; limit?: number; q?: string; sort?: 'newest' | 'oldest'; type?: string } = {}
  ): Promise<{ files: StoredFile[]; total: number; page: number; limit: number; totalPages: number }> {
    const room = await this.findById(roomId);
    if (!room) {
      return { files: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }

    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));

    let fileList = Array.from(room.files.values()).filter(f => !f.isDeleted);

    // Search query filter
    if (options.q) {
      const qLower = options.q.toLowerCase().trim();
      fileList = fileList.filter(f => f.fileName.toLowerCase().includes(qLower));
    }

    // Type filter
    if (options.type) {
      const typeLower = options.type.toLowerCase().trim();
      fileList = fileList.filter(f => f.fileType.toLowerCase().includes(typeLower));
    }

    // Sorting
    fileList.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return options.sort === 'oldest' ? timeA - timeB : timeB - timeA;
    });

    const total = fileList.length;
    const totalPages = Math.ceil(total / limit);
    const startIdx = (page - 1) * limit;
    const pagedFiles = fileList.slice(startIdx, startIdx + limit);

    return {
      files: pagedFiles,
      total,
      page,
      limit,
      totalPages
    };
  }

  static async deleteFile(roomId: string, fileId: string): Promise<boolean> {
    const room = await this.findById(roomId);
    if (!room) return false;
    const file = room.files.get(fileId);
    if (!file || file.isDeleted) return false;

    file.isDeleted = true;

    if (isPrismaAvailable && prisma) {
      try {
        await prisma.transferMetadata.update({
          where: { fileId },
          data: { isDeleted: true, deletedAt: new Date() }
        });
      } catch (e) {
        // Ignored
      }
    }
    return true;
  }

  static async verifyParticipant(roomId: string, token: string): Promise<{ participant?: ParticipantInfo; isHost: boolean }> {
    const room = await this.findById(roomId);
    if (!room) return { isHost: false };

    // Check host token
    if (hashToken(token) === room.hostTokenHash) {
      return { isHost: true };
    }

    // Check participant session tokens
    for (const p of room.participants.values()) {
      if (p.participantToken === token) {
        return { participant: p, isHost: Boolean(p.isHost) };
      }
    }

    return { isHost: false };
  }

  static async transferHost(roomId: string, targetParticipantId: string): Promise<boolean> {
    const room = await this.findById(roomId);
    if (!room || !room.participants.has(targetParticipantId)) return false;

    for (const p of room.participants.values()) {
      p.isHost = (p.id === targetParticipantId);
    }
    return true;
  }

  static async addTransferMetadata(roomId: string, metadata: FileMetadata): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) return;
    room.transfers.set(metadata.fileId, { ...metadata, status: 'announced' });
  }

  static async updateTransferStatus(roomId: string, fileId: string, status: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) return;
    const transfer = room.transfers.get(fileId);
    if (transfer) {
      transfer.status = status;
    }
  }

  static async deleteRoom(id: string): Promise<void> {
    const room = memoryRooms.get(id);
    if (room) {
      codeToRoomId.delete(room.code.toUpperCase());
      memoryRooms.delete(id);
    }
    await storageService.deleteRoomFiles(id);
    if (isPrismaAvailable && prisma) {
      try {
        await prisma.room.delete({ where: { id } });
      } catch (e) {
        // Ignored
      }
    }
  }

  static async cleanupExpiredRooms(): Promise<number> {
    const now = new Date();
    let cleaned = 0;
    for (const [id, room] of memoryRooms.entries()) {
      if (now > room.expiresAt) {
        this.deleteRoom(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  static getPublicRoomMetadata(room: MemoryRoom, hostId: string): RoomMetadata {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      createdAt: room.createdAt.toISOString(),
      expiresAt: room.expiresAt.toISOString(),
      hostId,
      isClosed: Boolean(room.isClosed),
      isPasswordProtected: Boolean(room.passwordHash),
      settings: room.settings,
      participants: Array.from(room.participants.values()).map(p => ({
        id: p.id,
        socketId: p.socketId,
        displayName: p.displayName,
        isHost: p.isHost,
        joinedAt: p.joinedAt,
        deviceType: p.deviceType,
        browser: p.browser,
        connectionState: p.connectionState
      }))
    };
  }
}
