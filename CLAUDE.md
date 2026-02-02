# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sarah is a web application that provides a chat interface to communicate with Claude AI, with support for MCP (Model Context Protocol) integrations like Mixpanel. It consists of a React frontend and a Node.js/Express backend with an agentic tool execution loop.

## Architecture

```
┌─────────────────────┐                      ┌─────────────────────────────────┐
│   Frontend (React)  │                      │       Backend (Node.js)         │
│                     │  POST /api/chat      │                                 │
│  - Chat interface   │ ──────────────────▶  │  ┌─────────────────────────┐   │
│  - Integration UI   │                      │  │   Claude Service        │   │
│  - OAuth handling   │  GET /api/mcp/*      │  │   - Agentic loop        │   │
│                     │ ──────────────────▶  │  │   - Tool execution      │   │
└─────────────────────┘                      │  └───────────┬─────────────┘   │
        :5173                                │              │                  │
                                             │  ┌───────────▼─────────────┐   │
                                             │  │   MCP Manager           │   │
                                             │  │   - OAuth flow          │   │
                                             │  │   - Per-user clients    │   │
                                             │  └───────────┬─────────────┘   │
                                             │              │           :3001 │
                                             │  ┌───────────▼─────────────┐   │
                                             │  │   Session Store         │   │
                                             │  │   - OAuth tokens        │   │
                                             │  └─────────────────────────┘   │
                                             └─────────────────────────────────┘
                                                            │
         ┌──────────────────────────────────────────────────┘
         │ OAuth Callback Server (:8001)
         │
         ▼
┌─────────────────────────────────────┐
│  Mixpanel MCP Server                │
│  https://mcp.mixpanel.com/mcp       │
│  - Segmentation, Funnels            │
│  - Retention, Event discovery       │
└─────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: React 18 with Vite, Tailwind CSS
- **Backend**: Node.js with Express, express-session
- **AI**: Anthropic SDK (@anthropic-ai/sdk)
- **MCP**: @modelcontextprotocol/sdk
- **Deployment**: Railway

## Project Structure

```
sarah-app/
├── frontend/                    # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── config.js            # API URL configuration
│   │   ├── components/
│   │   │   ├── ChatInterface.jsx
│   │   │   ├── IntegrationStatus.jsx
│   │   │   └── AgentConfig.jsx
│   │   └── main.jsx
│   ├── railway.toml             # Railway deployment config
│   └── vite.config.js
├── backend/                     # Express backend
│   ├── src/
│   │   ├── index.js             # Server entry + OAuth callback server
│   │   ├── routes/
│   │   │   ├── chat.js          # POST /api/chat (with tools)
│   │   │   ├── mcp.js           # MCP status & OAuth endpoints
│   │   │   └── agent.js         # Agent configuration
│   │   └── services/
│   │       ├── claude.js        # Claude API + agentic loop
│   │       ├── mcpManager.js    # MCP client & OAuth management
│   │       └── sessionStore.js  # In-memory token storage
│   ├── railway.toml             # Railway deployment config
│   └── .env.example
└── package.json                 # Root workspace
```

## Development Commands

### Setup
```bash
# Install all dependencies (from root)
npm install

# Copy and configure environment variables
cp backend/.env.example backend/.env
# Edit backend/.env and add your ANTHROPIC_API_KEY
```

### Running the Application
```bash
# Run both frontend and backend concurrently (from root)
npm run dev

# Or run separately:
npm run dev:backend   # Backend on http://localhost:3001 + OAuth on :8001
npm run dev:frontend  # Frontend on http://localhost:5173
```

## API Endpoints

### POST /api/chat
Send a message to Claude with optional tool support.

**Request:**
```json
{
  "message": "your question here",
  "useTools": true,
  "conversationHistory": []
}
```

**Response:**
```json
{
  "response": "Claude's answer",
  "conversationHistory": [...],
  "oauthActions": [{ "type": "oauth", "authUrl": "..." }]
}
```

### GET /api/mcp/status
Get MCP integration connection status.

### POST /api/mcp/connect/:server
Initiate OAuth flow for an MCP server (e.g., mixpanel).

### GET /health
Health check endpoint returns `{ "status": "ok" }`.

## Environment Variables

### Backend (`backend/.env`)
```
ANTHROPIC_API_KEY=your-api-key      # Required
PORT=3001                            # Server port
SESSION_SECRET=random-secret         # Session encryption
FRONTEND_URL=http://localhost:5173   # For CORS & redirects
```

### Frontend (`frontend/.env`)
```
VITE_API_URL=                        # Empty for dev (uses proxy), set for production
```

## MCP Integration

### Supported Integrations
- **Mixpanel** - Analytics and user behavior tracking
  - OAuth via MCP dynamic client registration
  - Tools: segmentation, funnels, retention, events

### OAuth Flow
1. User asks to connect to Mixpanel
2. Claude uses `connect_integration` tool
3. Backend discovers OAuth endpoints from MCP server
4. User authenticates via popup
5. Callback on port 8001 exchanges code for token
6. Token stored in session, MCP tools become available

### Built-in Tools
- `list_integrations` - Show available/connected integrations
- `connect_integration` - Initiate OAuth for an integration

## Deployment (Railway)

Both services have `railway.toml` configs. Deploy from GitHub:

1. Backend service: root directory `backend`
2. Frontend service: root directory `frontend`
3. Set environment variables in Railway dashboard

**Note:** Mixpanel OAuth only works locally (localhost:8001 is whitelisted). Production requires Mixpanel to whitelist your domain.

## Known Limitations

- **In-memory sessions**: Tokens lost on server restart (use Redis for production)
- **Mixpanel OAuth whitelist**: Only localhost URLs are pre-approved
- **Single region**: Currently hardcoded to US Mixpanel endpoint
