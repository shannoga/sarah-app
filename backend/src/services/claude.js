import Anthropic from '@anthropic-ai/sdk';

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
