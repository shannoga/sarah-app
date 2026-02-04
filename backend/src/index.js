import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chatRouter from './routes/chat.js';
import agentRouter from './routes/agent.js';
import mcpRouter from './routes/mcp.js';
import { handleOAuthCallbackByState, OAUTH_CALLBACK_PORT } from './services/mcpManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// Session middleware for per-user OAuth token storage
app.use(session({
  secret: process.env.SESSION_SECRET || 'sarah-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// Routes
app.use('/api/chat', chatRouter);
app.use('/api/agent', agentRouter);
app.use('/api/mcp', mcpRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Sarah API',
    endpoints: {
      'POST /api/chat': 'Send a message to Claude (with tool support)',
      'GET /api/mcp/status': 'Get MCP integration status',
      'POST /api/mcp/connect/:server': 'Connect to MCP server',
      'GET /api/mcp/callback': 'OAuth callback',
      'GET /health': 'Health check',
    },
    frontend: FRONTEND_URL,
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// OAuth Callback Server on port 8001 (required by Mixpanel's whitelist)
// Only runs in development - production requires Mixpanel to whitelist your domain
if (process.env.NODE_ENV !== 'production') {
  const oauthCallbackApp = express();

  oauthCallbackApp.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`
        <html>
          <head><title>Connection Failed</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>Connection Failed</h1>
            <p>${error_description || error}</p>
            <p><a href="${FRONTEND_URL}">Return to app</a></p>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state');
    }

    console.log('OAuth callback received on port 8001');
    console.log('State:', state);

    const result = await handleOAuthCallbackByState(code, state);

    res.send(`
      <html>
        <head>
          <title>Connected Successfully</title>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth_complete', server: '${result.serverId}' }, '*');
              window.close();
            } else {
              setTimeout(() => window.location.href = '${FRONTEND_URL}', 2000);
            }
          </script>
        </head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>Connected Successfully!</h1>
          <p>You have connected to ${result.serverId}.</p>
          <p>You can close this window and return to the chat.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <head><title>Connection Error</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>Connection Error</h1>
          <p>${error.message}</p>
          <p><a href="${FRONTEND_URL}">Return to app</a></p>
        </body>
      </html>
    `);
  }
});

  oauthCallbackApp.listen(OAUTH_CALLBACK_PORT, () => {
    console.log(`OAuth callback server running on http://localhost:${OAUTH_CALLBACK_PORT}`);
  });
}
