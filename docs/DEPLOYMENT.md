# Phoenix Drop Deployment Guide (Strictly ₹0 Budget)

This deployment guide uses exclusively verified **free-tier** services with zero automatic billing dependencies.

## 1. Zero-Cost Infrastructure Architecture

- **Web Frontend**: Vercel Free Tier (Hobby)
- **Signaling API Backend**: Render Free Tier (Web Service)
- **Database**: Neon Free Tier (PostgreSQL) or In-Memory Automatic Fallback
- **NAT Traversal (STUN)**: Public Google STUN servers (strictly free, best-effort)

---

## 2. Deploy Backend on Render (Free Tier)

1. Fork or push the Phoenix Drop repository to GitHub.
2. Sign in to [Render](https://render.com) using your free account.
3. Click **New +** -> **Blueprint**, or **New Web Service**:
   - **Root Directory**: leave blank or point to repository root.
   - **Build Command**: `npm install && npm run build --workspace=@phoenix-drop/shared && npm run build --workspace=@phoenix-drop/api`
   - **Start Command**: `npm run start --workspace=@phoenix-drop/api`
   - **Instance Type**: Free
   - **Health Check Path**: `/health`
4. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `CORS_ORIGIN`: `https://your-phoenix-drop.vercel.app`
   - `DATABASE_URL`: *(Optional)* Your Neon PostgreSQL connection string. If omitted, the built-in fallback store activates automatically.
5. Deploy. Render will provide a public URL (e.g., `https://phoenix-drop-api.onrender.com`).

> **Note on Render Free Tier**: Inactive instances spin down after 15 minutes of inactivity and take ~30–50 seconds to cold start on first request.

---

## 3. Deploy Frontend on Vercel (Free Tier)

1. Sign in to [Vercel](https://vercel.com) using your free Hobby account.
2. Click **Add New...** -> **Project**, select your GitHub repository.
3. Configure Project:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (Root directory, using `vercel.json`)
   - **Build Command**: `npm run build --workspace=@phoenix-drop/shared && npm run build --workspace=@phoenix-drop/web`
   - **Output Directory**: `apps/web/dist`
4. Set Environment Variables:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://phoenix-drop-api.onrender.com`)
5. Click **Deploy**. Vercel will provide your live URL (e.g. `https://phoenix-drop.vercel.app`).

---

## 4. Local Development Setup

```bash
# 1. Install all dependencies across workspaces
npm install

# 2. Build the shared package
npm run build --workspace=@phoenix-drop/shared

# 3. Start development servers concurrently
npm run dev
```

- Web UI opens at: `http://localhost:5173`
- API / Signaling opens at: `http://localhost:3001`
- Health check available at: `http://localhost:3001/health`
