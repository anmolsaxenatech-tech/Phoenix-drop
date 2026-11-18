# Phoenix Drop Architecture Documentation

## 1. System Overview

Phoenix Drop is a zero-infrastructure-cost, peer-to-peer file sharing platform designed for cross-device direct data transfers.

```
       +---------------------------------------------+
       |           Signaling Server (Node.js)        |
       |  - Socket.IO Room Broker                    |
       |  - SDP Offer/Answer Exchange                |
       |  - ICE Candidate Relay                      |
       |  - Presence & Room Settings                 |
       |  - Ephemeral Metadata (Prisma / In-Memory)  |
       +---------------------------------------------+
                       ^             ^
      WebSocket Signal |             | WebSocket Signal
      (Room metadata)  |             | (Room metadata)
                       v             v
             +------------+       +------------+
             |   Peer A   | <===> |   Peer B   |
             |  (Sender)  |       | (Receiver) |
             +------------+       +------------+
                   Direct WebRTC DataChannel
                 (Binary Chunks + Backpressure)
                 * ZERO BYTES ON BACKEND *
```

## 2. Directory Structure

```
/phoenix-drop
  /apps
    /web                 # Vite + React + TypeScript + Tailwind CSS PWA
      /public            # Web App Manifest, Service Worker, Logo
      /src
        /components      # LandingPage, RoomView, Modals, Navbar
        /services        # SocketService, WebRTCManager, TransferEngine, Api
    /api                 # Express + Socket.IO + TypeScript Backend
      /prisma            # Prisma schema (PostgreSQL metadata & presence)
      /src
        /routes          # Room creation, verification, host actions
        /signaling       # Socket.IO connection & signal dispatching
        /services        # Automated room expiration cleanup
  /packages
    /shared              # TypeScript types, Zod schemas, constants, wire protocol
  /docs                  # Architecture, WebRTC, Mobile, Security, Deployment docs
  render.yaml            # Render Free Tier deployment blueprint
  vercel.json            # Vercel Free Tier SPA configuration
  package.json           # Monorepo workspaces
```

## 3. Zero-Server Storage Principle

1. **Signaling Server Boundary**: The backend application explicitly does not provide any file upload endpoints (no multipart middleware, no file storage buffers, no S3/R2 upload targets).
2. **P2P Wire Transit**: When a user selects a file, it is sliced directly in browser memory and transmitted across `RTCDataChannel` directly to connected room peers.
3. **Database Boundary**: Prisma models store room ID, room code, expiration date, participant presence, and transfer metadata (file name, size, SHA-256 hash). File binaries are strictly prohibited in the database schema.
