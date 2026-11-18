import { z } from 'zod';
import { 
  DEFAULT_MAX_FILE_SIZE, 
  DEFAULT_MAX_PARTICIPANTS, 
  ABSOLUTE_MAX_PARTICIPANTS, 
  DEFAULT_ROOM_EXPIRATION_HOURS, 
  MAX_ROOM_EXPIRATION_HOURS,
  MAX_CHAT_MESSAGE_LENGTH 
} from './constants.js';

export const RoomSettingsSchema = z.object({
  maxParticipants: z.number().int().min(2).max(ABSOLUTE_MAX_PARTICIPANTS).default(DEFAULT_MAX_PARTICIPANTS),
  maxFileSize: z.number().int().min(1024).max(DEFAULT_MAX_FILE_SIZE).default(DEFAULT_MAX_FILE_SIZE),
  allowedExtensions: z.array(z.string().regex(/^[a-zA-Z0-9]+$/)).default([]),
  uploadsEnabled: z.boolean().default(true),
  downloadsEnabled: z.boolean().default(true),
  chatEnabled: z.boolean().default(true),
  isLocked: z.boolean().default(false),
  expirationHours: z.number().int().min(1).max(MAX_ROOM_EXPIRATION_HOURS).default(DEFAULT_ROOM_EXPIRATION_HOURS)
});

export const CreateRoomSchema = z.object({
  name: z.string().trim().min(2).max(64).default('Phoenix Drop Room'),
  password: z.string().min(4).max(64).optional().or(z.literal('')),
  displayName: z.string().trim().min(1).max(32).default('Host'),
  deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).default('unknown'),
  settings: RoomSettingsSchema.partial().optional()
});

export const JoinRoomSchema = z.object({
  roomId: z.string().trim().optional(),
  roomCode: z.string().trim().length(6).optional(),
  displayName: z.string().trim().min(1).max(32),
  password: z.string().optional(),
  deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).default('unknown')
}).refine(data => data.roomId || data.roomCode, {
  message: 'Either roomId or roomCode must be provided'
});

export const UpdateRoomSettingsSchema = z.object({
  roomId: z.string(),
  hostToken: z.string(),
  settings: RoomSettingsSchema.partial(),
  name: z.string().trim().min(2).max(64).optional()
});

export const HostActionSchema = z.object({
  roomId: z.string(),
  hostToken: z.string(),
  action: z.enum(['lock', 'unlock', 'kick_participant', 'transfer_host', 'delete_room']),
  targetParticipantId: z.string().optional()
});

export const SendChatMessageSchema = z.object({
  roomId: z.string(),
  content: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH)
});

export const FileMetadataSchema = z.object({
  fileId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(DEFAULT_MAX_FILE_SIZE),
  fileType: z.string().max(128).default('application/octet-stream'),
  totalChunks: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  senderId: z.string(),
  senderName: z.string(),
  createdAt: z.string()
});

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type UpdateRoomSettingsInput = z.infer<typeof UpdateRoomSettingsSchema>;
export type HostActionInput = z.infer<typeof HostActionSchema>;
export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>;
