import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server as SocketIOServer } from 'socket.io';
import { 
  FileListQuerySchema,
  InitiateMultipartUploadSchema,
  CompleteMultipartUploadSchema,
  sanitizeFilename,
  getFileExtension,
  StoredFile,
  RoomActivityLog
} from '@phoenix-drop/shared';
import { RoomRepository } from '../db.js';
import { storageService } from '../services/storage.js';

export const filesRouter = Router();

// Helper to authenticate room participant or host
async function authenticateRoomAccess(req: Request, roomId: string): Promise<{ authorized: boolean; isHost: boolean; participantId?: string; participantName?: string; error?: string; status?: number }> {
  const token = (
    req.headers['x-participant-token'] || 
    req.headers['x-host-token'] || 
    req.headers.authorization?.replace(/^Bearer\s+/i, '') || 
    req.query.token
  ) as string | undefined;

  if (!token) {
    return { authorized: false, isHost: false, error: 'Unauthorized: Missing session token', status: 401 };
  }

  const room = await RoomRepository.findById(roomId);
  if (!room) {
    return { authorized: false, isHost: false, error: 'Room not found or has expired', status: 404 };
  }

  const auth = await RoomRepository.verifyParticipant(roomId, token);
  if (!auth.isHost && !auth.participant) {
    return { authorized: false, isHost: false, error: 'Forbidden: Invalid token for this room', status: 403 };
  }

  return {
    authorized: true,
    isHost: auth.isHost,
    participantId: auth.participant?.id || 'host',
    participantName: auth.participant?.displayName || 'Host'
  };
}

// 1. GET /api/rooms/:id/files - List room files with pagination, search & sort
filesRouter.get('/:id/files', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const queryParse = FileListQuerySchema.safeParse(req.query);
    const options = queryParse.success ? queryParse.data : {};

    const result = await RoomRepository.listFiles(roomId, options);
    res.json(result);
  } catch (err) {
    console.error('[Files API] List error:', err);
    res.status(500).json({ error: 'Failed to retrieve file history' });
  }
});

// 2. POST /api/rooms/:id/files/upload - Upload file directly
filesRouter.post('/:id/files/upload', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const room = await RoomRepository.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.isClosed) {
      res.status(410).json({ error: 'Room is permanently closed. Uploads are disabled.', isClosed: true });
      return;
    }

    if (!room.settings.uploadsEnabled) {
      res.status(403).json({ error: 'Uploads are currently disabled in this room' });
      return;
    }

    const { fileName, fileType, fileSize, content, sha256 } = req.body;
    if (!fileName || !content) {
      res.status(400).json({ error: 'Missing fileName or file content' });
      return;
    }

    const safeName = sanitizeFilename(fileName);
    const ext = getFileExtension(safeName);
    if (room.settings.allowedExtensions.length > 0 && !room.settings.allowedExtensions.includes(ext)) {
      res.status(400).json({ error: `File extension .${ext} is not allowed in this room` });
      return;
    }

    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > room.settings.maxFileSize) {
      res.status(413).json({ error: `File size exceeds maximum allowed of ${room.settings.maxFileSize} bytes` });
      return;
    }

    const fileId = uuidv4();
    const storageKey = storageService.generateKey(roomId, fileId, safeName);
    await storageService.uploadFile(storageKey, buffer, fileType || 'application/octet-stream');

    const storedFile: StoredFile = {
      fileId,
      roomId,
      fileName: safeName,
      fileSize: buffer.length,
      fileType: fileType || 'application/octet-stream',
      senderId: auth.participantId || 'unknown',
      senderName: auth.participantName || 'Guest',
      sha256: sha256 || '',
      storageKey,
      createdAt: new Date().toISOString(),
      isDeleted: false
    };

    await RoomRepository.saveFile(storedFile);

    const activity: RoomActivityLog = {
      id: uuidv4(),
      roomId,
      type: 'file_uploaded',
      description: `${storedFile.senderName} uploaded "${storedFile.fileName}"`,
      actorId: storedFile.senderId,
      actorName: storedFile.senderName,
      timestamp: new Date().toISOString(),
      metadata: { fileId, fileName: storedFile.fileName, fileSize: storedFile.fileSize }
    };
    await RoomRepository.addActivity(roomId, activity);

    // Notify connected room peers via Socket.IO
    const io: SocketIOServer | undefined = req.app.get('io');
    if (io) {
      io.to(roomId).emit('file:created', storedFile);
      io.to(roomId).emit('activity:new', activity);
    }

    res.status(201).json({ file: storedFile });
  } catch (err) {
    console.error('[Files API] Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// 3. POST /api/rooms/:id/files/multipart/initiate - Start multipart upload for large files
filesRouter.post('/:id/files/multipart/initiate', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const room = await RoomRepository.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.isClosed) {
      res.status(410).json({ error: 'Room is permanently closed. Uploads are disabled.', isClosed: true });
      return;
    }

    if (!room.settings.uploadsEnabled) {
      res.status(403).json({ error: 'Uploads are currently disabled in this room' });
      return;
    }

    const parse = InitiateMultipartUploadSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid initiation payload', details: parse.error.flatten() });
      return;
    }

    const { fileName, fileSize, fileType } = parse.data;
    const safeName = sanitizeFilename(fileName);
    const ext = getFileExtension(safeName);
    if (room.settings.allowedExtensions.length > 0 && !room.settings.allowedExtensions.includes(ext)) {
      res.status(400).json({ error: `File extension .${ext} is not allowed in this room` });
      return;
    }

    if (fileSize > room.settings.maxFileSize) {
      res.status(413).json({ error: `File size exceeds room limit of ${room.settings.maxFileSize} bytes` });
      return;
    }

    const fileId = uuidv4();
    const storageKey = storageService.generateKey(roomId, fileId, safeName);
    const { uploadId } = await storageService.initiateMultipartUpload(storageKey, fileType);

    res.json({
      fileId,
      uploadId,
      storageKey,
      fileName: safeName
    });
  } catch (err) {
    console.error('[Files API] Multipart initiate error:', err);
    res.status(500).json({ error: 'Failed to initiate multipart upload' });
  }
});

// 4. POST /api/rooms/:id/files/multipart/part - Upload single chunk
filesRouter.post('/:id/files/multipart/part', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const { storageKey, uploadId, partNumber, content } = req.body;
    if (!storageKey || !uploadId || !partNumber || !content) {
      res.status(400).json({ error: 'Missing part upload parameters' });
      return;
    }

    const buffer = Buffer.from(content, 'base64');
    const { eTag } = await storageService.uploadPart(storageKey, uploadId, Number(partNumber), buffer);

    res.json({ eTag, partNumber: Number(partNumber) });
  } catch (err) {
    console.error('[Files API] Multipart part error:', err);
    res.status(500).json({ error: 'Failed to upload part' });
  }
});

// 5. POST /api/rooms/:id/files/multipart/complete - Complete multipart upload
filesRouter.post('/:id/files/multipart/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const parse = CompleteMultipartUploadSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid multipart completion payload', details: parse.error.flatten() });
      return;
    }

    const { fileId, uploadId, parts } = parse.data;
    const { storageKey, fileName, fileSize, fileType, sha256 } = req.body;

    await storageService.completeMultipartUpload(storageKey, uploadId, parts);

    const safeName = sanitizeFilename(fileName || 'unnamed-file');
    const storedFile: StoredFile = {
      fileId,
      roomId,
      fileName: safeName,
      fileSize: Number(fileSize) || 0,
      fileType: fileType || 'application/octet-stream',
      senderId: auth.participantId || 'unknown',
      senderName: auth.participantName || 'Guest',
      sha256: sha256 || '',
      storageKey,
      createdAt: new Date().toISOString(),
      isDeleted: false
    };

    await RoomRepository.saveFile(storedFile);

    const activity: RoomActivityLog = {
      id: uuidv4(),
      roomId,
      type: 'file_uploaded',
      description: `${storedFile.senderName} uploaded "${storedFile.fileName}"`,
      actorId: storedFile.senderId,
      actorName: storedFile.senderName,
      timestamp: new Date().toISOString(),
      metadata: { fileId, fileName: storedFile.fileName, fileSize: storedFile.fileSize }
    };
    await RoomRepository.addActivity(roomId, activity);

    const io: SocketIOServer | undefined = req.app.get('io');
    if (io) {
      io.to(roomId).emit('file:created', storedFile);
      io.to(roomId).emit('activity:new', activity);
    }

    res.json({ success: true, file: storedFile });
  } catch (err) {
    console.error('[Files API] Multipart complete error:', err);
    res.status(500).json({ error: 'Failed to complete multipart upload' });
  }
});

// 6. POST /api/rooms/:id/files/multipart/abort - Abort multipart upload
filesRouter.post('/:id/files/multipart/abort', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const { storageKey, uploadId } = req.body;
    if (storageKey && uploadId) {
      await storageService.abortMultipartUpload(storageKey, uploadId);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Files API] Multipart abort error:', err);
    res.status(500).json({ error: 'Failed to abort multipart upload' });
  }
});

// 7. GET /api/rooms/:id/files/:fileId/download - Authenticated download with range requests
filesRouter.get('/:id/files/:fileId/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const fileId = String(req.params.fileId);

    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const room = await RoomRepository.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.isClosed) {
      res.status(410).json({ error: 'Room is permanently closed. Downloads are unavailable.', isClosed: true });
      return;
    }

    if (!room.settings.downloadsEnabled) {
      res.status(403).json({ error: 'Downloads are disabled in this room' });
      return;
    }

    const file = await RoomRepository.getFile(roomId, fileId);
    if (!file || file.isDeleted) {
      res.status(404).json({ error: 'File not found or has been removed' });
      return;
    }

    const key = file.storageKey || storageService.generateKey(roomId, file.fileId, file.fileName);
    const rangeHeader = req.headers.range;

    const download = await storageService.getDownloadStream(key, rangeHeader);
    if (!download) {
      res.status(404).json({ error: 'Stored file object not found in storage' });
      return;
    }

    const safeFilename = encodeURIComponent(file.fileName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Type', download.mimeType || file.fileType || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-transform, max-age=300');

    if (download.statusCode === 206 && download.contentRange) {
      res.status(206);
      res.setHeader('Content-Range', download.contentRange);
      res.setHeader('Content-Length', download.contentLength);
    } else {
      res.status(200);
      res.setHeader('Content-Length', download.contentLength);
    }

    download.stream.pipe(res);
  } catch (err) {
    console.error('[Files API] Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process file download' });
    }
  }
});

// 8. DELETE /api/rooms/:id/files/:fileId - Delete file (host or original uploader only)
filesRouter.delete('/:id/files/:fileId', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const fileId = String(req.params.fileId);

    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const file = await RoomRepository.getFile(roomId, fileId);
    if (!file || file.isDeleted) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Permission check: only host OR the original uploader can delete
    const isUploader = auth.participantId && file.senderId === auth.participantId;
    if (!auth.isHost && !isUploader) {
      res.status(403).json({ error: 'Forbidden: Only the host or original uploader can delete this file' });
      return;
    }

    await RoomRepository.deleteFile(roomId, fileId);
    if (file.storageKey) {
      await storageService.deleteFile(file.storageKey);
    }

    const activity: RoomActivityLog = {
      id: uuidv4(),
      roomId,
      type: 'file_deleted',
      description: `${auth.participantName} deleted "${file.fileName}"`,
      actorId: auth.participantId,
      actorName: auth.participantName,
      timestamp: new Date().toISOString(),
      metadata: { fileId, fileName: file.fileName }
    };
    await RoomRepository.addActivity(roomId, activity);

    const io: SocketIOServer | undefined = req.app.get('io');
    if (io) {
      io.to(roomId).emit('file:deleted', { fileId, fileName: file.fileName });
      io.to(roomId).emit('activity:new', activity);
    }

    res.json({ success: true, fileId });
  } catch (err) {
    console.error('[Files API] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// 9. GET /api/rooms/:id/activities - Retrieve room activity timeline
filesRouter.get('/:id/activities', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.id);
    const auth = await authenticateRoomAccess(req, roomId);
    if (!auth.authorized) {
      res.status(auth.status || 401).json({ error: auth.error });
      return;
    }

    const activities = await RoomRepository.getActivities(roomId);
    res.json({ activities });
  } catch (err) {
    console.error('[Files API] Activities error:', err);
    res.status(500).json({ error: 'Failed to retrieve activity history' });
  }
});
