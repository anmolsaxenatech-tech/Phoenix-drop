import { PrismaClient } from '@prisma/client';
import { 
  RoomMetadata, 
  RoomSettings, 
  ParticipantInfo, 
  ChatMessage, 
  RoomActivityLog, 
  FileMetadata 
} from '@phoenix-drop/shared';
import { config } from './config.js';

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
    if (room.activities.length > 200) {
      room.activities.shift();
    }
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
