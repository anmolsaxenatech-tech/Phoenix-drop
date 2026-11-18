import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from './index.js';
import { RoomRepository } from './db.js';

describe('Phoenix Drop API & Room Lifecycle Integration Tests', () => {
  let server: http.Server;
  let io: any;
  let baseUrl: string;

  before(async () => {
    process.env.NODE_ENV = 'test';
    const instance = createApp();
    server = instance.server;
    io = instance.io;
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      if (io) {
        io.close(() => {
          server.close(() => resolve());
        });
      } else {
        server.close(() => resolve());
      }
    });
  });

  it('GET /health returns healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.equal(body.service, 'phoenix-drop-api');
  });

  it('POST /api/rooms rejects room creation without mandatory room name', async () => {
    // Missing room name
    const failRes1 = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Charlie' })
    });
    assert.equal(failRes1.status, 400);

    // Empty whitespace room name
    const failRes2 = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', displayName: 'Charlie' })
    });
    assert.equal(failRes2.status, 400);
  });

  it('Creates room, returns credentials and supports code lookup', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alpha Project Room',
        displayName: 'Alice Host',
        settings: { maxParticipants: 8, uploadsEnabled: true, downloadsEnabled: true }
      })
    });

    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.room.id);
    assert.ok(created.room.code);
    assert.equal(created.room.name, 'Alpha Project Room');
    assert.ok(created.hostToken);
    assert.ok(created.participantToken);

    // Lookup by 6-char room code
    const fetchRes = await fetch(`${baseUrl}/api/rooms/${created.room.code}`);
    assert.equal(fetchRes.status, 200);
    const fetched = await fetchRes.json();
    assert.equal(fetched.room.id, created.room.id);
  });

  // TEST 1 & 2: Host leaves while other participants remain -> ownership transferred atomically & room stays open
  it('1 & 2. Host leaves while other participants remain -> ownership transfer succeeds & room remains open', async () => {
    // Create room
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Transfer Test Room', displayName: 'Host 1' })
    });
    const { room, hostToken, participantToken } = await createRes.json();
    const roomId = room.id;

    // Connect Host socket
    const hostSocket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });

    let guestJoinRes: any;
    let hostTransferNotified = false;
    let newHostIdFromEvent = '';

    await new Promise<void>((resolve) => {
      hostSocket.emit('room:join', { roomId, displayName: 'Host 1', hostToken }, () => {
        guestSocket.emit('room:join', { roomId, displayName: 'Guest Bob' }, (res: any) => {
          guestJoinRes = res;
          resolve();
        });
      });
    });

    assert.ok(guestJoinRes.success);
    assert.equal(guestJoinRes.self.isHost, false);
    const guestId = guestJoinRes.self.id;

    guestSocket.on('room:host_transferred', (data: { newHostId: string }) => {
      hostTransferNotified = true;
      newHostIdFromEvent = data.newHostId;
    });

    // Host explicitly leaves room
    await new Promise<void>((resolve) => {
      hostSocket.emit('room:leave', () => {
        hostSocket.disconnect();
        resolve();
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Verify room is NOT closed
    const roomCheck = await fetch(`${baseUrl}/api/rooms/${roomId}`);
    assert.equal(roomCheck.status, 200);
    const roomData = await roomCheck.json();
    assert.equal(roomData.room.isClosed, false);

    // Verify ownership was transferred to Guest Bob
    assert.equal(hostTransferNotified, true);
    assert.equal(newHostIdFromEvent, guestId);

    guestSocket.disconnect();
  });

  // TEST 3 & 4: Host closes room -> marks closed, blocks new joins, notifies all connected peers
  it('3 & 4. Host closes room -> marks closed, blocks joins with 410, notifies peers', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Closure Test Room', displayName: 'Closing Host' })
    });
    const { room, hostToken } = await createRes.json();
    const roomId = room.id;

    const hostSocket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const guestSocket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });

    let closeNotified = false;

    await new Promise<void>((resolve) => {
      hostSocket.emit('room:join', { roomId, displayName: 'Closing Host', hostToken }, () => {
        guestSocket.emit('room:join', { roomId, displayName: 'Guest Dave' }, () => {
          resolve();
        });
      });
    });

    guestSocket.on('room:closed', () => {
      closeNotified = true;
    });

    // Host closes room
    await new Promise<void>((resolve) => {
      hostSocket.emit('host:close_room', { hostToken }, (res: any) => {
        assert.ok(res.success);
        resolve();
      });
    });

    await new Promise((r) => setTimeout(r, 100));

    // Verify socket notification was received
    assert.equal(closeNotified, true);

    // Verify subsequent API access returns 410 Gone
    const fetchClosed = await fetch(`${baseUrl}/api/rooms/${roomId}`);
    assert.equal(fetchClosed.status, 410);

    // Verify new joins are rejected
    const joinClosedSocket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const joinResult = await new Promise<any>((resolve) => {
      joinClosedSocket.emit('room:join', { roomId, displayName: 'Late Comer' }, (res: any) => {
        resolve(res);
      });
    });
    assert.ok(joinResult.error);
    assert.match(joinResult.error, /closed/i);

    hostSocket.disconnect();
    guestSocket.disconnect();
    joinClosedSocket.disconnect();
  });

  // TEST 5, 6, 7 & 8: Persistent Shared File History (Late Joiner, Downloads, Survives uploader leave)
  it('5, 6, 7 & 8. Persistent File History: Anmol uploads 3, Ayush uploads 2, late joiner sees all 5 and can download', async () => {
    // 1. Create Room (Anmol)
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Project History Room', displayName: 'Anmol' })
    });
    const { room, participantToken: anmolToken } = await createRes.json();
    const roomId = room.id;

    // Anmol uploads 3 files
    const file1Content = Buffer.from('Anmol Document 1 Content').toString('base64');
    const file2Content = Buffer.from('Anmol Image 2 Binary Simulation').toString('base64');
    const file3Content = Buffer.from('Anmol Presentation 3 Data').toString('base64');

    const u1 = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': anmolToken },
      body: JSON.stringify({ fileName: 'doc1.txt', fileType: 'text/plain', content: file1Content })
    });
    assert.equal(u1.status, 201);
    const { file: file1 } = await u1.json();

    const u2 = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': anmolToken },
      body: JSON.stringify({ fileName: 'photo2.png', fileType: 'image/png', content: file2Content })
    });
    assert.equal(u2.status, 201);

    const u3 = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': anmolToken },
      body: JSON.stringify({ fileName: 'slides3.pdf', fileType: 'application/pdf', content: file3Content })
    });
    assert.equal(u3.status, 201);

    // 2. Ayush joins room
    const ayushSocket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const ayushJoin: any = await new Promise((resolve) => {
      ayushSocket.emit('room:join', { roomId, displayName: 'Ayush' }, (res: any) => resolve(res));
    });
    const ayushToken = ayushJoin.participantToken;

    // Ayush uploads 2 files
    const file4Content = Buffer.from('Ayush Spreadsheet 4').toString('base64');
    const file5Content = Buffer.from('Ayush Notes 5').toString('base64');

    const u4 = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': ayushToken },
      body: JSON.stringify({ fileName: 'sheet4.xlsx', fileType: 'application/vnd.openxmlformats', content: file4Content })
    });
    assert.equal(u4.status, 201);

    const u5 = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': ayushToken },
      body: JSON.stringify({ fileName: 'notes5.md', fileType: 'text/markdown', content: file5Content })
    });
    assert.equal(u5.status, 201);

    // Ayush disconnects / leaves room
    ayushSocket.disconnect();

    // 3. Late participant joins (TEST 5: Must see all 5 files immediately!)
    const lateSocket: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });
    const lateJoin: any = await new Promise((resolve) => {
      lateSocket.emit('room:join', { roomId, displayName: 'Late Participant Priya' }, (res: any) => resolve(res));
    });
    assert.ok(lateJoin.success);
    const lateToken = lateJoin.participantToken;

    // Check files returned in join response
    assert.ok(lateJoin.existingFiles);
    assert.equal(lateJoin.existingFiles.length, 5);

    // Also verify via GET /api/rooms/:id/files endpoint
    const fileListRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files`, {
      headers: { 'X-Participant-Token': lateToken }
    });
    assert.equal(fileListRes.status, 200);
    const fileListData = await fileListRes.json();
    assert.equal(fileListData.total, 5);
    assert.equal(fileListData.files.length, 5);

    // TEST 6: Late participant downloads file1 (uploaded earlier by Anmol)
    const downloadRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/${file1.fileId}/download?token=${lateToken}`);
    assert.equal(downloadRes.status, 200);
    const downloadedText = await downloadRes.text();
    assert.equal(downloadedText, 'Anmol Document 1 Content');
    assert.match(downloadRes.headers.get('content-disposition') || '', /doc1\.txt/);

    // TEST 8: File remains accessible after uploader leaves (Ayush's file4 can be downloaded by Priya)
    const file4Item = fileListData.files.find((f: any) => f.fileName === 'sheet4.xlsx');
    assert.ok(file4Item);
    const dl4Res = await fetch(`${baseUrl}/api/rooms/${roomId}/files/${file4Item.fileId}/download?token=${lateToken}`);
    assert.equal(dl4Res.status, 200);
    const dl4Text = await dl4Res.text();
    assert.equal(dl4Text, 'Ayush Spreadsheet 4');

    lateSocket.disconnect();
  });

  // TEST 9 & 14: Browser refresh and reconnection restore room state and files
  it('9 & 14. Browser refresh and reconnection restore participant & file state', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Refresh Test Room', displayName: 'Emma' })
    });
    const { room, participantToken } = await createRes.json();
    const roomId = room.id;

    // Upload a file
    await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': participantToken },
      body: JSON.stringify({ fileName: 'refresh-check.txt', fileType: 'text/plain', content: Buffer.from('Persisted content').toString('base64') })
    });

    // Simulate page refresh: client calls GET /files and GET /activities with stored token
    const refreshedFiles = await fetch(`${baseUrl}/api/rooms/${roomId}/files`, {
      headers: { 'X-Participant-Token': participantToken }
    });
    assert.equal(refreshedFiles.status, 200);
    const data = await refreshedFiles.json();
    assert.equal(data.total, 1);
    assert.equal(data.files[0].fileName, 'refresh-check.txt');

    const refreshedActs = await fetch(`${baseUrl}/api/rooms/${roomId}/activities`, {
      headers: { 'X-Participant-Token': participantToken }
    });
    assert.equal(refreshedActs.status, 200);
    const actData = await refreshedActs.json();
    assert.ok(actData.activities.length >= 2); // room_created and file_uploaded
  });

  // TEST 10: Deleted files are unavailable to everyone
  it('10. Deleted files are removed from listings and cannot be downloaded', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Delete Room', displayName: 'Host' })
    });
    const { room, participantToken } = await createRes.json();
    const roomId = room.id;

    // Upload file
    const uRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': participantToken },
      body: JSON.stringify({ fileName: 'to-delete.txt', fileType: 'text/plain', content: Buffer.from('temporary').toString('base64') })
    });
    const { file } = await uRes.json();

    // Delete file
    const delRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/${file.fileId}`, {
      method: 'DELETE',
      headers: { 'X-Participant-Token': participantToken }
    });
    assert.equal(delRes.status, 200);

    // Verify file is gone from list
    const listRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files`, {
      headers: { 'X-Participant-Token': participantToken }
    });
    const listData = await listRes.json();
    assert.equal(listData.total, 0);

    // Verify download returns 404
    const dlRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/${file.fileId}/download?token=${participantToken}`);
    assert.equal(dlRes.status, 404);
  });

  // TEST 12: Unauthorized users cannot download files
  it('12. Unauthorized users cannot download files or access room files', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Security Room', displayName: 'SecHost' })
    });
    const { room, participantToken } = await createRes.json();
    const roomId = room.id;

    const uRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': participantToken },
      body: JSON.stringify({ fileName: 'confidential.pdf', fileType: 'application/pdf', content: Buffer.from('secret').toString('base64') })
    });
    const { file } = await uRes.json();

    // Attempt download with NO token -> 401
    const noTokenRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/${file.fileId}/download`);
    assert.equal(noTokenRes.status, 401);

    // Attempt download with INVALID token -> 403
    const badTokenRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/${file.fileId}/download?token=fake-token-12345`);
    assert.equal(badTokenRes.status, 403);
  });

  // TEST 13: Simultaneous uploads work correctly
  it('13. Simultaneous concurrent uploads complete and persist without race conditions', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Concurrent Upload Room', displayName: 'Speedy' })
    });
    const { room, participantToken } = await createRes.json();
    const roomId = room.id;

    const uploadPromises = Array.from({ length: 5 }, (_, i) => {
      return fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Participant-Token': participantToken },
        body: JSON.stringify({
          fileName: `parallel-file-${i}.txt`,
          fileType: 'text/plain',
          content: Buffer.from(`Content of parallel file ${i}`).toString('base64')
        })
      });
    });

    const results = await Promise.all(uploadPromises);
    for (const res of results) {
      assert.equal(res.status, 201);
    }

    // Verify all 5 are present
    const listRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files`, {
      headers: { 'X-Participant-Token': participantToken }
    });
    const listData = await listRes.json();
    assert.equal(listData.total, 5);
  });

  // TEST 11: Expired rooms follow retention rules
  it('11. Expired rooms follow retention rules and are purged cleanly', async () => {
    // Manually create an expired room
    const expiredId = 'expired-test-room-id';
    await RoomRepository.createRoom({
      id: expiredId,
      code: 'EXPIRE',
      name: 'Expired Room',
      hostTokenHash: 'hash',
      expiresAt: new Date(Date.now() - 10000), // in the past
      settings: {
        maxParticipants: 10,
        maxFileSize: 1000000,
        allowedExtensions: [],
        uploadsEnabled: true,
        downloadsEnabled: true,
        chatEnabled: true,
        isLocked: false,
        expirationHours: 24
      }
    });

    // Cleanup service execution
    const purgedCount = await RoomRepository.cleanupExpiredRooms();
    assert.ok(purgedCount >= 1);

    // Verify room is deleted
    const check = await RoomRepository.findById(expiredId);
    assert.equal(check, null);
  });

  // HTTP Range Request Verification for Large Files & Resumable Downloads
  it('Supports HTTP Range requests for partial file streaming', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Range Stream Room', displayName: 'Streamer' })
    });
    const { room, participantToken } = await createRes.json();
    const roomId = room.id;

    const fullContent = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const uRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Participant-Token': participantToken },
      body: JSON.stringify({ fileName: 'range-test.dat', fileType: 'application/octet-stream', content: Buffer.from(fullContent).toString('base64') })
    });
    const { file } = await uRes.json();

    // Request byte range 0-9
    const rangeRes = await fetch(`${baseUrl}/api/rooms/${roomId}/files/${file.fileId}/download?token=${participantToken}`, {
      headers: { Range: 'bytes=0-9' }
    });

    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range'), `bytes 0-9/${fullContent.length}`);
    const chunk = await rangeRes.text();
    assert.equal(chunk, '0123456789');
  });
});
