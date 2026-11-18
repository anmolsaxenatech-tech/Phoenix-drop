import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from './index.js';

describe('Phoenix Drop API Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    process.env.NODE_ENV = 'test';
    const instance = createApp();
    server = instance.server;
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
      server.close(() => resolve());
    });
  });

  it('GET /health returns healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.equal(body.service, 'phoenix-drop-api');
  });

  it('POST /api/rooms creates a room and returns host credentials', async () => {
    const res = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Room Alpha',
        displayName: 'Alice Host',
        settings: {
          maxParticipants: 8,
          uploadsEnabled: true
        }
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.room);
    assert.ok(body.room.id);
    assert.ok(body.room.code);
    assert.equal(body.room.name, 'Test Room Alpha');
    assert.ok(body.hostToken);
    assert.ok(body.participantToken);
  });

  it('GET /api/rooms/:code finds room by 6-character room code', async () => {
    // 1. Create room
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Code Lookup Room',
        displayName: 'Bob'
      })
    });
    const created = await createRes.json();
    const code = created.room.code;

    // 2. Fetch by code
    const fetchRes = await fetch(`${baseUrl}/api/rooms/${code}`);
    assert.equal(fetchRes.status, 200);
    const body = await fetchRes.json();
    assert.equal(body.room.id, created.room.id);
    assert.equal(body.room.code, code);
  });

  it('POST /api/rooms with password verifies valid and invalid passwords', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Protected Room',
        password: 'SuperSecret123!',
        displayName: 'Charlie'
      })
    });
    const created = await createRes.json();
    const roomId = created.room.id;

    // Verify invalid password
    const failRes = await fetch(`${baseUrl}/api/rooms/${roomId}/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'WrongPassword' })
    });
    assert.equal(failRes.status, 401);

    // Verify correct password
    const passRes = await fetch(`${baseUrl}/api/rooms/${roomId}/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'SuperSecret123!' })
    });
    assert.equal(passRes.status, 200);
    const passBody = await passRes.json();
    assert.equal(passBody.valid, true);
  });

  it('POST /api/rooms/:id/settings rejects unauthorized updates and accepts valid host token', async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Settings Room',
        displayName: 'Dave'
      })
    });
    const created = await createRes.json();
    const roomId = created.room.id;
    const hostToken = created.hostToken;

    // Unauthorized attempt
    const unauthRes = await fetch(`${baseUrl}/api/rooms/${roomId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        hostToken: 'fake-token-123456789012345678901234',
        settings: { chatEnabled: false }
      })
    });
    assert.equal(unauthRes.status, 403);

    // Authorized attempt
    const authRes = await fetch(`${baseUrl}/api/rooms/${roomId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        hostToken,
        settings: { chatEnabled: false }
      })
    });
    assert.equal(authRes.status, 200);
    const authBody = await authRes.json();
    assert.equal(authBody.updatedSettings.chatEnabled, false);
  });

  it('Returns 404 for non-existent room', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/NONEXS`);
    assert.equal(res.status, 404);
  });
});
