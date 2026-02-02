import Anthropic from '@anthropic-ai/sdk';
import { getAllAvailableTools, executeTool } from './mcpManager.js';

let client = null;
let systemPrompt = null;

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export function setSystemPrompt(prompt) {
  systemPrompt = prompt;
}

export function getSystemPrompt() {
  return systemPrompt;
}

export async function sendMessage(userMessage) {
  const requestOptions = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  };

  if (systemPrompt) {
    requestOptions.system = systemPrompt;
  }

  const response = await getClient().messages.create(requestOptions);

  // Extract text from the response
  const textContent = response.content.find((block) => block.type === 'text');
  return textContent ? textContent.text : '';
}

export async function getAvailableTools(sessionId) {
  return getAllAvailableTools(sessionId);
}

export async function sendMessageWithTools(sessionId, userMessage, conversationHistory = []) {
  const tools = await getAvailableTools(sessionId);
  const oauthActions = [];

  // Build messages array from conversation history
  const messages = [...conversationHistory];
  messages.push({
    role: 'user',
    content: userMessage,
  });

  const baseSystemPrompt = systemPrompt || '';
  const toolSystemPrompt = `${baseSystemPrompt}

You have access to MCP integrations that can help users access their data from various services.
Available integrations include Mixpanel for analytics data.

When a user wants to connect to an integration:
1. Use the connect_integration tool to get the OAuth URL
2. Share the OAuth URL with the user so they can authenticate
3. After they authenticate, you can use the integration's tools to query their data

When querying data from integrations, be helpful and explain what you're doing.`;

  const requestOptions = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: toolSystemPrompt,
    messages,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description || 'No description provided',
      input_schema: t.input_schema || t.inputSchema || {
        type: 'object',
        properties: {},
        required: [],
      },
    })),
  };

  let response = await getClient().messages.create(requestOptions);
  let iterations = 0;
  const maxIterations = 10;

  // Agentic loop: continue while Claude wants to use tools
  while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
    iterations++;

    // Find all tool use blocks
    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');

    // Add assistant's response (including tool use) to messages
    messages.push({
      role: 'assistant',
      content: response.content,
    });

    // Execute each tool and collect results
    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      try {
        const result = await executeTool(sessionId, toolUse.name, toolUse.input);

        // Check if this is an OAuth action
        if (result.action === 'oauth_required') {
          oauthActions.push({
            type: 'oauth',
            authUrl: result.authUrl,
            message: result.message,
          });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: error.message }),
          is_error: true,
        });
      }
    }

    // Add tool results to messages
    messages.push({
      role: 'user',
      content: toolResults,
    });

    // Continue the conversation
    response = await getClient().messages.create({
      ...requestOptions,
      messages,
    });
  }

  // Add final assistant response to messages for history
  messages.push({
    role: 'assistant',
    content: response.content,
  });

  // Extract text from the final response
  const textContent = response.content.find((block) => block.type === 'text');
  const responseText = textContent ? textContent.text : '';

  return {
    response: responseText,
    conversationHistory: messages,
    oauthActions,
  };
}
