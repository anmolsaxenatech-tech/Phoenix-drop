import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { 
  SignalJoinPayload, 
  ChatMessage, 
  FileMetadata, 
  RoomSettings,
  MAX_CHAT_MESSAGE_LENGTH
} from '@phoenix-drop/shared';
import { RoomRepository } from '../db.js';
import { config } from '../config.js';
import { verifyPassword, hashToken } from '../security.js';

interface SocketData {
  roomId?: string;
  participantId?: string;
  isHost?: boolean;
  displayName?: string;
  lastMessageTime?: number;
  messageCountLastMin?: number;
}

export function setupSignaling(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const data: SocketData = {};

    // 1. Join Room
    socket.on('room:join', async (payload: SignalJoinPayload, callback?: (res: unknown) => void) => {
      try {
        let room = payload.roomId ? await RoomRepository.findById(payload.roomId) : null;
        if (!room && payload.roomCode) {
          room = await RoomRepository.findByCode(payload.roomCode);
        }

        if (!room) {
          callback?.({ error: 'Room not found or has expired' });
          return;
        }

        if (room.isLocked) {
          callback?.({ error: 'This room is currently locked by the host' });
          return;
        }

        if (room.participants.size >= room.settings.maxParticipants) {
          callback?.({ error: 'Room has reached maximum participant capacity' });
          return;
        }

        if (room.passwordHash) {
          if (!payload.password) {
            callback?.({ error: 'Password required', requiresPassword: true });
            return;
          }
          const valid = await verifyPassword(payload.password, room.passwordHash);
          if (!valid) {
            callback?.({ error: 'Invalid room password' });
            return;
          }
        }

        // Determine if first participant or host
        const isHost = room.participants.size === 0;
        const participantId = uuidv4();
        const participantToken = uuidv4();

        const participant = {
          id: participantId,
          socketId: socket.id,
          displayName: payload.displayName || 'Guest',
          isHost,
          joinedAt: new Date().toISOString(),
          deviceType: payload.deviceType || 'unknown',
          connectionState: 'connected' as const,
          participantToken
        };

        await RoomRepository.addParticipant(room.id, participant);

        data.roomId = room.id;
        data.participantId = participantId;
        data.isHost = isHost;
        data.displayName = participant.displayName;

        socket.join(room.id);

        // Find existing hostId
        let hostId = participantId;
        for (const p of room.participants.values()) {
          if (p.isHost) {
            hostId = p.id;
            break;
          }
        }

        const publicMetadata = RoomRepository.getPublicRoomMetadata(room, hostId);

        // Send confirmation back to joining client
        callback?.({
          success: true,
          room: publicMetadata,
          self: {
            id: participant.id,
            socketId: socket.id,
            displayName: participant.displayName,
            isHost: participant.isHost,
            joinedAt: participant.joinedAt,
            deviceType: participant.deviceType,
            connectionState: participant.connectionState
          },
          participantToken,
          iceServers: config.stunServers
        });

        // Notify other room participants
        socket.to(room.id).emit('signal:peer_joined', {
          peer: {
            id: participant.id,
            socketId: socket.id,
            displayName: participant.displayName,
            isHost: participant.isHost,
            joinedAt: participant.joinedAt,
            deviceType: participant.deviceType,
            connectionState: participant.connectionState
          }
        });

        // Add system message & activity
        const joinMsg: ChatMessage = {
          id: uuidv4(),
          roomId: room.id,
          senderId: 'system',
          senderName: 'System',
          isHost: false,
          isSystem: true,
          content: `${participant.displayName} joined the room`,
          timestamp: new Date().toISOString()
        };
        await RoomRepository.addChatMessage(room.id, joinMsg);
        io.to(room.id).emit('chat:message', joinMsg);

        await RoomRepository.addActivity(room.id, {
          id: uuidv4(),
          roomId: room.id,
          type: 'participant_joined',
          description: `${participant.displayName} joined`,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error('[Signaling] Join error:', err);
        callback?.({ error: 'Server error joining room' });
      }
    });

    // 2. WebRTC Offer Forwarding
    socket.on('signal:offer', (payload: { targetPeerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data.roomId || !data.participantId) return;
      socket.to(data.roomId).emit('signal:offer', {
        senderPeerId: data.participantId,
        targetPeerId: payload.targetPeerId,
        sdp: payload.sdp
      });
    });

    // 3. WebRTC Answer Forwarding
    socket.on('signal:answer', (payload: { targetPeerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data.roomId || !data.participantId) return;
      socket.to(data.roomId).emit('signal:answer', {
        senderPeerId: data.participantId,
        targetPeerId: payload.targetPeerId,
        sdp: payload.sdp
      });
    });

    // 4. WebRTC ICE Candidate Forwarding
    socket.on('signal:ice_candidate', (payload: { targetPeerId: string; candidate: RTCIceCandidateInit }) => {
      if (!data.roomId || !data.participantId) return;
      socket.to(data.roomId).emit('signal:ice_candidate', {
        senderPeerId: data.participantId,
        targetPeerId: payload.targetPeerId,
        candidate: payload.candidate
      });
    });

    // 5. Chat Messages with Rate Limiting
    socket.on('chat:send', async (payload: { content: string }, callback?: (res: unknown) => void) => {
      if (!data.roomId || !data.participantId || !data.displayName) {
        callback?.({ error: 'Not in a room' });
        return;
      }

      const room = await RoomRepository.findById(data.roomId);
      if (!room || !room.settings.chatEnabled) {
        callback?.({ error: 'Chat is disabled in this room' });
        return;
      }

      // Rate limiting: max 30 msgs per min
      const now = Date.now();
      if (!data.lastMessageTime || now - data.lastMessageTime > 60000) {
        data.lastMessageTime = now;
        data.messageCountLastMin = 1;
      } else {
        data.messageCountLastMin = (data.messageCountLastMin || 0) + 1;
        if (data.messageCountLastMin > 30) {
          callback?.({ error: 'Chat rate limit reached. Please wait a moment.' });
          return;
        }
      }

      const cleanContent = (payload.content || '').trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
      if (!cleanContent) return;

      const message: ChatMessage = {
        id: uuidv4(),
        roomId: data.roomId,
        senderId: data.participantId,
        senderName: data.displayName,
        isHost: Boolean(data.isHost),
        isSystem: false,
        content: cleanContent,
        timestamp: new Date().toISOString()
      };

      await RoomRepository.addChatMessage(data.roomId, message);
      io.to(data.roomId).emit('chat:message', message);
      callback?.({ success: true, message });
    });

    // 6. Transfer Announcement
    socket.on('transfer:announce', async (metadata: FileMetadata, callback?: (res: unknown) => void) => {
      if (!data.roomId || !data.participantId) {
        callback?.({ error: 'Not in a room' });
        return;
      }

      const room = await RoomRepository.findById(data.roomId);
      if (!room || !room.settings.uploadsEnabled) {
        callback?.({ error: 'File uploads are currently disabled in this room' });
        return;
      }

      if (metadata.fileSize > room.settings.maxFileSize) {
        callback?.({ error: 'File size exceeds maximum allowed in this room' });
        return;
      }

      await RoomRepository.addTransferMetadata(data.roomId, metadata);

      // Broadcast announcement to all peers in the room
      socket.to(data.roomId).emit('transfer:announced', metadata);

      const sysMsg: ChatMessage = {
        id: uuidv4(),
        roomId: data.roomId,
        senderId: 'system',
        senderName: 'System',
        isHost: false,
        isSystem: true,
        content: `${metadata.senderName} shared "${metadata.fileName}"`,
        timestamp: new Date().toISOString()
      };
      await RoomRepository.addChatMessage(data.roomId, sysMsg);
      io.to(data.roomId).emit('chat:message', sysMsg);

      callback?.({ success: true });
    });

    // 7. Host Controls
    socket.on('host:kick', async (payload: { targetPeerId: string; hostToken: string }) => {
      if (!data.roomId) return;
      const room = await RoomRepository.findById(data.roomId);
      if (!room || hashToken(payload.hostToken) !== room.hostTokenHash) return;

      const target = room.participants.get(payload.targetPeerId);
      if (target) {
        await RoomRepository.removeParticipant(data.roomId, payload.targetPeerId);
        io.to(target.socketId).emit('room:kicked', { reason: 'You have been removed by the host' });
        io.to(data.roomId).emit('signal:peer_left', { peerId: payload.targetPeerId });
      }
    });

    socket.on('host:update_settings', async (payload: { settings: Partial<RoomSettings>; hostToken: string; name?: string }) => {
      if (!data.roomId) return;
      const room = await RoomRepository.findById(data.roomId);
      if (!room || hashToken(payload.hostToken) !== room.hostTokenHash) return;

      await RoomRepository.updateSettings(data.roomId, payload.settings, payload.name);
      io.to(data.roomId).emit('room:updated', { settings: room.settings, name: room.name });
    });

    // 8. Disconnect Cleanup
    socket.on('disconnect', async () => {
      if (data.roomId && data.participantId) {
        await RoomRepository.removeParticipant(data.roomId, data.participantId);
        socket.to(data.roomId).emit('signal:peer_left', { peerId: data.participantId });

        if (data.displayName) {
          const leaveMsg: ChatMessage = {
            id: uuidv4(),
            roomId: data.roomId,
            senderId: 'system',
            senderName: 'System',
            isHost: false,
            isSystem: true,
            content: `${data.displayName} left the room`,
            timestamp: new Date().toISOString()
          };
          await RoomRepository.addChatMessage(data.roomId, leaveMsg);
          socket.to(data.roomId).emit('chat:message', leaveMsg);
        }
      }
    });
  });
}
