# PHOENIX DROP

> **One Room. Unlimited Possibilities.**

A free-first, room-based peer-to-peer file-sharing platform where users can create private rooms, invite friends using a link or room code, and transfer files directly between devices anywhere in the world.

---

## ⚡ Zero-Server-Storage & Budget Policy

- **Strictly ₹0 Infrastructure**: Zero paid TURN servers, zero Cloudflare R2 / AWS S3 storage buckets, and zero automatic billing dependencies.
- **Direct P2P DataChannels**: File binaries **never** touch the application backend. All file bytes travel directly between sender and receiver via WebRTC DataChannels.
- **Adaptive Backpressure**: Monitors `RTCDataChannel.bufferedAmount` and drains via `bufferedamountlow` to prevent browser memory exhaustion on transfers up to 10 GB.
- **End-to-End Integrity**: Automatic SHA-256 cryptographic verification using the native Web Crypto API prior to completing transfers.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, Socket.IO Client, Lucide Icons |
| **Backend** | Node.js, Express, TypeScript, Socket.IO, PostgreSQL, Prisma ORM, Zod, PBKDF2/Argon2id |
| **Shared** | Monorepo package (`@phoenix-drop/shared`) with Zod schemas, PDCK wire protocol, and formatters |
| **P2P Engine** | WebRTC `RTCPeerConnection`, `RTCDataChannel`, public Google STUN servers |
| **PWA** | Web App Manifest, Service Worker caching, Web Share API, native file picker |

---

## 📁 Repository Structure

```
/phoenix-drop
  /apps
    /web                 # Vite + React 19 + Tailwind CSS PWA
      /public            # Manifest, Service Worker, Logo
      /src               # Components, WebRTC Manager, Transfer Engine
    /api                 # Express + Socket.IO Signaling Server
      /prisma            # Prisma schema (Room & presence metadata only)
      /src               # REST routes, Signaling handlers, Expiration service
  /packages
    /shared              # Types, Zod validation schemas, PDCK wire framing
  /docs                  # Architecture, WebRTC, Mobile, Security, Deployment
  render.yaml            # Render Free Tier deployment blueprint
  vercel.json            # Vercel Free Tier SPA configuration
  package.json           # Monorepo workspaces configuration
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x

### Installation & Launch
```bash
# 1. Clone the repository and install dependencies
npm install

# 2. Build the shared package
npm run build --workspace=@phoenix-drop/shared

# 3. Start development servers concurrently
npm run dev
```

- Web Interface: [http://localhost:5173](http://localhost:5173)
- API & Signaling Server: [http://localhost:3001](http://localhost:3001)
- Health Check: [http://localhost:3001/health](http://localhost:3001/health)

---

## 🧪 Testing

Run comprehensive automated test suites across all workspaces:

```bash
# Run unit & integration tests
npm run test
```

### Verified Test Suites:
- `@phoenix-drop/shared`:
  - 16-byte UUID binary packing & unpacking.
  - PDCK 24-byte header chunk framing and payload extraction.
  - Dangerous filename sanitization and traversal protection.
  - Unambiguous 6-character room code generator.
  - Zod validation for room creation and joining.
  - 1 MB WebRTC chunk transfer streaming & SHA-256 integrity simulation.
  - Corrupted chunk bit-flip detection test.
- `@phoenix-drop/api`:
  - `GET /health` service status.
  - `POST /api/rooms` room creation and host token generation.
  - `GET /api/rooms/:code` room discovery via 6-character code.
  - Room password protection and verification with PBKDF2.
  - Host authorization checks and unauthorized setting rejections.
  - 404 handling for expired or non-existent rooms.

---

## 🌐 Production Deployment (Strictly Free Tier)

Detailed step-by-step instructions are available in [docs/DEPLOYMENT.md](file:///d:/Programming/vs%20code/Phoenix%20drop/docs/DEPLOYMENT.md):

- **Frontend**: [Vercel](https://vercel.com) (Hobby Free Tier) using `vercel.json`.
- **Backend**: [Render](https://render.com) (Web Service Free Tier) using `render.yaml`.
- **Database**: [Neon](https://neon.tech) (PostgreSQL Free Tier) or automatic built-in in-memory fallback.

---

## 📖 Detailed Documentation

- [Architecture Guide](file:///d:/Programming/vs%20code/Phoenix%20drop/docs/ARCHITECTURE.md)
- [WebRTC Transfer Engine](file:///d:/Programming/vs%20code/Phoenix%20drop/docs/WEBRTC.md)
- [Mobile Device Compatibility & Limitations](file:///d:/Programming/vs%20code/Phoenix%20drop/docs/MOBILE.md)
- [Security & Privacy Principles](file:///d:/Programming/vs%20code/Phoenix%20drop/docs/SECURITY.md)
- [Deployment Configuration](file:///d:/Programming/vs%20code/Phoenix%20drop/docs/DEPLOYMENT.md)
