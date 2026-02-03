import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL_MAP: Record<string, string> = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
}

export async function callClaude(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  model: string = 'haiku'
): Promise<string> {
  const modelId = MODEL_MAP[model] || MODEL_MAP.haiku

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  const textBlock = response.content.find(block => block.type === 'text')
  return textBlock?.text || ''
}
