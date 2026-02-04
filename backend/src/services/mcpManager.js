import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { getToken, setToken, setOAuthState, getOAuthState, clearOAuthState, findOAuthStateByToken } from './sessionStore.js';
import crypto from 'crypto';

// OAuth callback configuration
// In production, use OAUTH_CALLBACK_URL env var (requires Mixpanel to whitelist your domain)
// In development, defaults to localhost:8001 (pre-whitelisted by Mixpanel)
const OAUTH_CALLBACK_PORT = 8001;
const OAUTH_REDIRECT_URI = process.env.OAUTH_CALLBACK_URL || `http://localhost:${OAUTH_CALLBACK_PORT}/callback`;

// MCP server configurations
const MCP_SERVERS = {
  mixpanel: {
    name: 'Mixpanel',
    description: 'Analytics and user behavior tracking',
    endpoints: {
      us: 'https://mcp.mixpanel.com/mcp',
      eu: 'https://mcp-eu.mixpanel.com/mcp',
      india: 'https://mcp-in.mixpanel.com/mcp',
    },
    defaultRegion: 'us',
    registrationEndpoint: 'https://mcp.mixpanel.com/oauth/register',
  },
};

// Cache of MCP clients per session
const clientCache = new Map();

// Cache for dynamically registered client credentials
let registeredClient = null;

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

async function registerDynamicClient(registrationEndpoint) {
  // Return cached client if available
  if (registeredClient) {
    return registeredClient;
  }

  console.log('Registering dynamic OAuth client...');

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_name: 'Sarah Chat App',
      redirect_uris: [OAUTH_REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Dynamic client registration failed: ${error}`);
  }

  registeredClient = await response.json();
  console.log('Registered client_id:', registeredClient.client_id);
  console.log('Allowed redirect_uris:', registeredClient.redirect_uris);

  return registeredClient;
}

export { OAUTH_CALLBACK_PORT, OAUTH_REDIRECT_URI };

export function getAvailableServers() {
  return Object.entries(MCP_SERVERS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
  }));
}

export function getServerStatus(sessionId, serverId) {
  const token = getToken(sessionId, serverId);
  return {
    id: serverId,
    name: MCP_SERVERS[serverId]?.name || serverId,
    connected: !!token,
    expiresAt: token?.expires_at || null,
  };
}

export function getAllServerStatus(sessionId) {
  return Object.keys(MCP_SERVERS).map((serverId) => getServerStatus(sessionId, serverId));
}

export async function initiateOAuthFlow(sessionId, serverId, region = 'us') {
  const serverConfig = MCP_SERVERS[serverId];
  if (!serverConfig) {
    throw new Error(`Unknown MCP server: ${serverId}`);
  }

  const endpoint = serverConfig.endpoints[region] || serverConfig.endpoints[serverConfig.defaultRegion];

  // Generate PKCE and state
  const pkce = generatePKCE();
  const state = generateState();

  // For Mixpanel MCP, we need to discover the OAuth endpoints
  // The MCP server should return 401 with WWW-Authenticate header
  try {
    console.log('Discovering OAuth endpoints from MCP server...');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'Sarah', version: '1.0.0' },
        },
        id: 1,
      }),
    });

    if (response.status === 401) {
      // Parse WWW-Authenticate header for OAuth metadata
      const wwwAuth = response.headers.get('WWW-Authenticate');
      console.log('WWW-Authenticate header:', wwwAuth);

      if (wwwAuth) {
        const resourceMetadataMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
        if (resourceMetadataMatch) {
          const resourceMetadataUrl = resourceMetadataMatch[1];
          console.log('Resource metadata URL:', resourceMetadataUrl);

          // Fetch resource metadata to get authorization server
          const resourceMetadata = await fetch(resourceMetadataUrl).then(r => r.json());
          const authServerUrl = resourceMetadata.authorization_servers?.[0];
          console.log('Auth server URL:', authServerUrl);

          if (authServerUrl) {
            // Fetch OAuth server metadata
            const oauthMetadataUrl = `${authServerUrl}.well-known/oauth-authorization-server`;
            console.log('OAuth metadata URL:', oauthMetadataUrl);
            const oauthMetadata = await fetch(oauthMetadataUrl).then(r => r.json());
            console.log('OAuth metadata:', JSON.stringify(oauthMetadata, null, 2));

            // Register dynamic client if registration endpoint exists
            let clientId;
            if (oauthMetadata.registration_endpoint) {
              const client = await registerDynamicClient(oauthMetadata.registration_endpoint);
              clientId = client.client_id;
            } else {
              clientId = process.env.MIXPANEL_CLIENT_ID || 'sarah-chat-app';
            }

            // Store OAuth state for callback verification
            setOAuthState(sessionId, state, {
              serverId,
              region,
              endpoint,
              codeVerifier: pkce.verifier,
              tokenEndpoint: oauthMetadata.token_endpoint,
              authorizationEndpoint: oauthMetadata.authorization_endpoint,
              clientId,
            });

            // Build OAuth URL with scopes from metadata
            const authUrl = new URL(oauthMetadata.authorization_endpoint);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('client_id', clientId);
            authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI);
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('code_challenge', pkce.challenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');

            // Use supported scopes from metadata
            const scopes = resourceMetadata.scopes_supported || oauthMetadata.scopes_supported || [];
            if (scopes.length > 0) {
              authUrl.searchParams.set('scope', scopes.join(' '));
            }

            console.log('OAuth URL:', authUrl.toString());

            return {
              authUrl: authUrl.toString(),
              state,
            };
          }
        }
      }
    }

    // If we get here without finding OAuth endpoints, the server might not require auth
    throw new Error('Could not discover OAuth endpoints from MCP server');
  } catch (error) {
    console.error('OAuth discovery error:', error);
    throw error;
  }
}

// Handle OAuth callback with just state token (for callback server on port 8001)
export async function handleOAuthCallbackByState(code, state) {
  const oauthData = findOAuthStateByToken(state);
  if (!oauthData) {
    throw new Error('Invalid or expired OAuth state');
  }

  const { sessionId, serverId, codeVerifier, tokenEndpoint, clientId } = oauthData;
  return handleOAuthCallbackInternal(sessionId, code, state, oauthData);
}

export async function handleOAuthCallback(sessionId, code, state) {
  const oauthData = getOAuthState(sessionId, state);
  if (!oauthData) {
    throw new Error('Invalid or expired OAuth state');
  }

  return handleOAuthCallbackInternal(sessionId, code, state, oauthData);
}

async function handleOAuthCallbackInternal(sessionId, code, state, oauthData) {
  const { serverId, codeVerifier, tokenEndpoint, clientId } = oauthData;

  console.log('Exchanging code for token...');
  console.log('Token endpoint:', tokenEndpoint);
  console.log('Client ID:', clientId);
  console.log('Redirect URI:', OAUTH_REDIRECT_URI);

  // Exchange code for token
  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: OAUTH_REDIRECT_URI,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Token exchange failed:', error);
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokenData = await tokenResponse.json();
  console.log('Token received successfully');

  // Store the token
  setToken(sessionId, serverId, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
    token_type: tokenData.token_type || 'Bearer',
  });

  // Clear OAuth state
  clearOAuthState(sessionId, state);

  return {
    serverId,
    success: true,
  };
}

export async function getMcpClient(sessionId, serverId, region = 'us') {
  const cacheKey = `${sessionId}:${serverId}`;

  // Return cached client if available
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey);
  }

  const serverConfig = MCP_SERVERS[serverId];
  if (!serverConfig) {
    throw new Error(`Unknown MCP server: ${serverId}`);
  }

  const token = getToken(sessionId, serverId);
  if (!token) {
    throw new Error(`Not authenticated with ${serverId}. Please connect first.`);
  }

  const endpoint = serverConfig.endpoints[region] || serverConfig.endpoints[serverConfig.defaultRegion];

  // Create MCP client with HTTP transport
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: {
      headers: {
        Authorization: `${token.token_type || 'Bearer'} ${token.access_token}`,
      },
    },
  });

  const client = new Client(
    { name: 'sarah-chat', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  // Cache the client
  clientCache.set(cacheKey, client);

  return client;
}

export async function listMcpTools(sessionId, serverId, region = 'us') {
  try {
    const client = await getMcpClient(sessionId, serverId, region);
    const tools = await client.listTools();
    return tools.tools || [];
  } catch (error) {
    console.error(`Error listing tools for ${serverId}:`, error);
    return [];
  }
}

export async function callMcpTool(sessionId, serverId, toolName, args, region = 'us') {
  const client = await getMcpClient(sessionId, serverId, region);
  const result = await client.callTool({ name: toolName, arguments: args });
  return result;
}

export async function disconnectMcp(sessionId, serverId) {
  const cacheKey = `${sessionId}:${serverId}`;

  // Close and remove cached client
  if (clientCache.has(cacheKey)) {
    const client = clientCache.get(cacheKey);
    try {
      await client.close();
    } catch (e) {
      // Ignore close errors
    }
    clientCache.delete(cacheKey);
  }

  // Remove token
  const { removeToken } = await import('./sessionStore.js');
  removeToken(sessionId, serverId);

  return { success: true };
}

export async function getAllAvailableTools(sessionId) {
  const tools = [];

  // Add built-in tools
  tools.push({
    name: 'list_integrations',
    description: 'List available MCP integrations and their connection status',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  });

  tools.push({
    name: 'connect_integration',
    description: 'Connect to an MCP integration like Mixpanel. Returns an OAuth URL the user must visit to authenticate.',
    input_schema: {
      type: 'object',
      properties: {
        integration: {
          type: 'string',
          description: 'The integration to connect to (e.g., "mixpanel")',
          enum: Object.keys(MCP_SERVERS),
        },
        region: {
          type: 'string',
          description: 'The region for the integration (us, eu, or india for Mixpanel)',
          enum: ['us', 'eu', 'india'],
        },
      },
      required: ['integration'],
    },
  });

  // Get tools from connected MCP servers
  for (const serverId of Object.keys(MCP_SERVERS)) {
    const token = getToken(sessionId, serverId);
    if (token) {
      try {
        const mcpTools = await listMcpTools(sessionId, serverId);
        for (const tool of mcpTools) {
          tools.push({
            ...tool,
            _mcpServer: serverId,
          });
        }
      } catch (error) {
        console.error(`Error getting tools from ${serverId}:`, error);
      }
    }
  }

  return tools;
}

export async function executeTool(sessionId, toolName, args) {
  // Handle built-in tools
  if (toolName === 'list_integrations') {
    const status = getAllServerStatus(sessionId);
    return {
      integrations: status,
      message: status.some((s) => s.connected)
        ? `Connected integrations: ${status.filter((s) => s.connected).map((s) => s.name).join(', ')}`
        : 'No integrations connected. Available: ' + status.map((s) => s.name).join(', '),
    };
  }

  if (toolName === 'connect_integration') {
    const { integration, region = 'us' } = args;
    const result = await initiateOAuthFlow(sessionId, integration, region);
    return {
      action: 'oauth_required',
      authUrl: result.authUrl,
      message: `Please click the link to authenticate with ${MCP_SERVERS[integration]?.name || integration}: ${result.authUrl}`,
    };
  }

  // Check if tool belongs to an MCP server
  const allTools = await getAllAvailableTools(sessionId);
  const tool = allTools.find((t) => t.name === toolName);

  if (tool && tool._mcpServer) {
    const result = await callMcpTool(sessionId, tool._mcpServer, toolName, args);
    return result;
  }

  throw new Error(`Unknown tool: ${toolName}`);
}
