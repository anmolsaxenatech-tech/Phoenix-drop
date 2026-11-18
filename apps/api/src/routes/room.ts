import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { 
  CreateRoomSchema, 
  UpdateRoomSettingsSchema, 
  HostActionSchema,
  generateRoomCode,
  DEFAULT_MAX_PARTICIPANTS,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_ROOM_EXPIRATION_HOURS,
  RoomSettings
} from '@phoenix-drop/shared';
import { RoomRepository } from '../db.js';
import { generateSecureToken, hashToken, hashPassword, verifyPassword } from '../security.js';

export const roomRouter = Router();

// POST /api/rooms - Create Room
roomRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = CreateRoomSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid room creation parameters', details: parseResult.error.flatten() });
      return;
    }

    const { name, displayName, settings: userSettings } = parseResult.data;

    const roomId = uuidv4();
    let code = generateRoomCode();

    // Ensure room code uniqueness
    let existing = await RoomRepository.findByCode(code);
    let attempts = 0;
    while (existing && attempts < 5) {
      code = generateRoomCode();
      existing = await RoomRepository.findByCode(code);
      attempts++;
    }

    const hostToken = generateSecureToken();
    const hostTokenHash = hashToken(hostToken);
    const participantToken = generateSecureToken();
    const hostParticipantId = uuidv4();

    const expirationHours = userSettings?.expirationHours || DEFAULT_ROOM_EXPIRATION_HOURS;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    const mergedSettings: RoomSettings = {
      maxParticipants: userSettings?.maxParticipants || DEFAULT_MAX_PARTICIPANTS,
      maxFileSize: userSettings?.maxFileSize || DEFAULT_MAX_FILE_SIZE,
      allowedExtensions: userSettings?.allowedExtensions || [],
      uploadsEnabled: userSettings?.uploadsEnabled ?? true,
      downloadsEnabled: userSettings?.downloadsEnabled ?? true,
      chatEnabled: userSettings?.chatEnabled ?? true,
      isLocked: userSettings?.isLocked ?? false,
      expirationHours
    };

    await RoomRepository.createRoom({
      id: roomId,
      code,
      name,
      hostTokenHash,
      expiresAt,
      settings: mergedSettings
    });

    const hostParticipant = {
      id: hostParticipantId,
      socketId: '',
      displayName,
      isHost: true,
      joinedAt: new Date().toISOString(),
      deviceType: parseResult.data.deviceType,
      connectionState: 'connecting' as const,
      participantToken
    };

    await RoomRepository.addParticipant(roomId, hostParticipant);

    const room = await RoomRepository.findById(roomId);
    if (!room) {
      res.status(500).json({ error: 'Failed to create room' });
      return;
    }

    const publicMetadata = RoomRepository.getPublicRoomMetadata(room, hostParticipantId);

    res.status(201).json({
      room: publicMetadata,
      hostToken,
      participantToken,
      participantId: hostParticipantId
    });
  } catch (err) {
    console.error('[API] Error creating room:', err);
    res.status(500).json({ error: 'Internal server error while creating room' });
  }
});

// GET /api/rooms/:idOrCode - Get room details by ID or 6-char code
roomRouter.get('/:idOrCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const idOrCode = String(req.params.idOrCode);
    let room = await RoomRepository.findById(idOrCode);
    if (!room) {
      room = await RoomRepository.findByCode(idOrCode);
    }

    if (!room) {
      res.status(404).json({ error: 'Room not found or has expired' });
      return;
    }

    if (room.isClosed) {
      res.status(410).json({ error: 'This room has been permanently closed by the host', isClosed: true });
      return;
    }

    // Find host ID
    let hostId = '';
    for (const p of room.participants.values()) {
      if (p.isHost) {
        hostId = p.id;
        break;
      }
    }

    const publicMetadata = RoomRepository.getPublicRoomMetadata(room, hostId);

    res.json({
      room: publicMetadata,
      isLocked: room.isLocked,
      isPasswordProtected: Boolean(room.passwordHash),
      isFull: room.participants.size >= room.settings.maxParticipants
    });
  } catch (err) {
    console.error('[API] Error getting room:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms/:id/verify-password - Verify room password
roomRouter.post('/:id/verify-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { password } = req.body;

    const room = await RoomRepository.findById(id);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (!room.passwordHash) {
      res.json({ valid: true });
      return;
    }

    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    const isValid = await verifyPassword(password, room.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('[API] Error verifying password:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms/:id/settings - Update settings (Host only)
roomRouter.post('/:id/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = UpdateRoomSettingsSchema.safeParse({ ...req.body, roomId: String(req.params.id) });
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid settings update', details: parseResult.error.flatten() });
      return;
    }

    const { roomId, hostToken, settings, name } = parseResult.data;
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Verify host token hash
    if (hashToken(hostToken) !== room.hostTokenHash) {
      res.status(403).json({ error: 'Unauthorized: Invalid host token' });
      return;
    }

    await RoomRepository.updateSettings(roomId, settings, name);
    res.json({ success: true, updatedSettings: room.settings });
  } catch (err) {
    console.error('[API] Error updating settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms/:id/action - Host action
roomRouter.post('/:id/action', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = HostActionSchema.safeParse({ ...req.body, roomId: String(req.params.id) });
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid host action', details: parseResult.error.flatten() });
      return;
    }

    const { roomId, hostToken, action, targetParticipantId } = parseResult.data;
    const room = await RoomRepository.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (hashToken(hostToken) !== room.hostTokenHash) {
      res.status(403).json({ error: 'Unauthorized: Invalid host token' });
      return;
    }

    switch (action) {
      case 'close_room':
        await RoomRepository.closeRoom(roomId);
        break;
      case 'lock':
        room.isLocked = true;
        room.settings.isLocked = true;
        break;
      case 'unlock':
        room.isLocked = false;
        room.settings.isLocked = false;
        break;
      case 'delete_room':
        await RoomRepository.deleteRoom(roomId);
        break;
      case 'kick_participant':
        if (targetParticipantId) {
          await RoomRepository.removeParticipant(roomId, targetParticipantId);
        }
        break;
      case 'transfer_host':
        if (targetParticipantId && room.participants.has(targetParticipantId)) {
          for (const p of room.participants.values()) {
            p.isHost = (p.id === targetParticipantId);
          }
        }
        break;
    }

    res.json({ success: true, action });
  } catch (err) {
    console.error('[API] Error executing host action:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
