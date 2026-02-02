# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sarah is a web application that provides a chat interface to communicate with Claude AI. It consists of a React frontend and a Node.js/Express backend.

## Architecture

```
┌─────────────────────┐     HTTP POST      ┌─────────────────────┐
│   Frontend (React)  │ ───────────────▶   │  Backend (Node.js)  │
│   - Input field     │                    │  - Express server   │
│   - Submit button   │ ◀───────────────   │  - Claude API call  │
│   - Response area   │     JSON response  │                     │
└─────────────────────┘                    └─────────────────────┘
```

## Tech Stack

- **Frontend**: React 18 with Vite, Tailwind CSS
- **Backend**: Node.js with Express
- **AI**: Anthropic SDK (@anthropic-ai/sdk)

## Project Structure

```
sarah-app/
├── frontend/           # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   └── ChatInterface.jsx
│   │   └── main.jsx
│   └── vite.config.js
├── backend/            # Express backend
│   ├── src/
│   │   ├── index.js    # Server entry point
│   │   ├── routes/
│   │   │   └── chat.js # POST /api/chat
│   │   └── services/
│   │       └── claude.js
│   └── .env.example
└── package.json        # Root workspace
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
npm run dev:backend   # Backend on http://localhost:3001
npm run dev:frontend  # Frontend on http://localhost:5173
```

### Individual Workspace Commands
```bash
# Backend
cd backend && npm run dev    # Development with watch mode
cd backend && npm start      # Production

# Frontend
cd frontend && npm run dev   # Development server
cd frontend && npm run build # Production build
```

## API Endpoints

### POST /api/chat
Send a message to Claude and receive a response.

**Request:**
```json
{
  "message": "your question here"
}
```

**Response:**
```json
{
  "response": "Claude's answer"
}
```

### GET /health
Health check endpoint returns `{ "status": "ok" }`.

## Environment Variables

Required in `backend/.env`:
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `PORT` - Server port (default: 3001)
