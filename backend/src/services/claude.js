import Anthropic from '@anthropic-ai/sdk';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export async function sendMessage(userMessage) {
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  // Extract text from the response
  const textContent = response.content.find((block) => block.type === 'text');
  return textContent ? textContent.text : '';
}
