# Hyperclaw App — Setup & Usage Guide

## Prerequisites

- Node.js 18+
- MongoDB (for UserManager)
- A running [Hypercho_UserManager](../Hypercho_UserManager) instance (default: `http://localhost:9979`)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# 3. Run in development mode
npm run dev
# App runs at http://localhost:1000

# 4. Or run as Electron desktop app
npm run electron:dev
```

## Environment Variables

Create a `.env` file in the project root. Key variables:

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` | App URL, e.g. `http://localhost:1000/` |
| `NEXTAUTH_SECRET` | JWT signing secret — **must match** UserManager's `JWT_TOKEN` and Hub's `--jwt-secret` |
| `NEXT_PUBLIC_HYPERCHO_API` | UserManager API URL, e.g. `http://localhost:9979` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `STRIPE_SECRET_KEY` | Stripe secret key (for deployment subscriptions) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `OPENAI_API_KEY` | OpenAI key (for AI features) |

Generate a shared secret for JWT:
```bash
openssl rand -base64 32
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 1000 |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run electron:dev` | Start Electron dev mode |
| `npm run electron:build` | Build Electron app (macOS) |
| `npm run electron:build:win` | Build Electron app (Windows) |

## Features

### Dashboard (`/dashboard`)

The main view. A customizable widget grid with drag-and-drop layout. Available widgets:

- **Clock** — current time
- **Pomodoro** — focus timer
- **Logs** — activity log viewer
- **Kanban** — task board
- **Crons** — scheduled jobs
- **Docs** — document browser
- **Pixel Office** — virtual office
- **Usage** — API usage stats
- **Gateway Chat** — real-time chat
- **Deployment** — manage AI deployments (new)

Click the edit icon in the dashboard header to rearrange widgets or toggle their visibility.

### Deployment Flow (`/deploy/*`)

Deploy AI models to cloud platforms:

1. **Select Model** (`/deploy/select-model`) — choose from Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, GPT-4 Turbo, Claude 3 Opus, or Llama 3.1 405B
2. **Select Channel** (`/deploy/select-channel`) — pick a deployment target (Vercel, Netlify, Railway, or Custom Server)
3. **Subscribe** (`/deploy/subscribe`) — review summary and complete payment via Stripe

After deployment, the new instance appears in the Deployment widget on the dashboard.

Access via the user dropdown menu (top-right avatar) -> "Deploy".

### Todo System (`/Tool/TodoList`)

Unified todo management backed by UserManager MongoDB:

- Create lists, tasks, and subtasks
- Assign agents, set due dates, star tasks
- Changes sync automatically to `~/.hyperclaw/todo.json` for offline access and OpenClaw agent consumption
- Falls back to local file reads if UserManager is unreachable

### Authentication

Login at `/auth/Login`. Supports:

- **Email/Password** — credentials stored in UserManager
- **Google OAuth** — requires Google client ID/secret in `.env`

JWT tokens use standardized `{ sub: userId, tier }` claims, compatible across Hyperclaw_app, UserManager, and Hub.

## Project Structure

```
Hyperclaw_app/
├── pages/                  # Next.js Pages Router
│   ├── api/                # API routes (auth, stripe, hub)
│   ├── auth/               # Login/signup pages
│   ├── deploy/             # Deployment wizard
│   ├── dashboard.tsx       # Main dashboard
│   └── Tool/               # Tool pages (TodoList, etc.)
├── components/
│   ├── Home/               # Dashboard widgets and layout
│   ├── Grainient/          # WebGL gradient background
│   ├── Navigation/         # Sidebar and nav
│   └── Tool/               # Tool UI components
├── services/
│   └── tools/todo/         # Todo API layer
│       ├── index.ts        # Remote API (UserManager)
│       ├── local.ts        # Local file fallback
│       ├── unified.ts      # Unified service (remote + sync + fallback)
│       └── sync.ts         # Sync adapter
├── store/
│   └── deployment.ts       # Zustand deployment state
├── lib/
│   └── shared-auth.ts      # JWT sign/verify utility
└── electron/               # Electron wrapper
```

## Related Services

| Service | Port | Purpose |
|---------|------|---------|
| **Hyperclaw_app** | 1000 | Main frontend (this project) |
| **Hypercho_UserManager** | 9979 | Auth, user data, todo storage |
| **hyperclaw-hub** | — | WebSocket relay for devices |
| **hyperclaw-connector** | — | Local device agent |
| **Hypercho_blog** | — | Blog (independent) |

All services share the same JWT secret for cross-service auth. See `../.env.example` for details.
