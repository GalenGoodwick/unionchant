import Anthropic from '@anthropic-ai/sdk'
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'

const MODEL_MAP: Record<string, string> = {
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
}

let anthropic: Anthropic | null = null

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to .env.local')
  }
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropic
}

export type ToolDefinition = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type ToolResult = {
  toolName: string
  toolInput: Record<string, unknown>
}

export type ClaudeResponse = {
  text: string
  toolUse?: ToolResult
}

export async function callClaude(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  model: string = 'haiku'
): Promise<string> {
  const result = await callClaudeWithTools(systemPrompt, messages, model)
  return result.text
}

export async function callClaudeWithTools(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  model: string = 'haiku',
  tools?: ToolDefinition[]
): Promise<ClaudeResponse> {
  const client = getClient()
  const modelId = MODEL_MAP[model] || MODEL_MAP.haiku

  const params: MessageCreateParamsNonStreaming = {
    model: modelId,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  }
  if (tools && tools.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params.tools = tools as any
  }

  const response: Message = await client.messages.create(params)

  const textBlock = response.content.find(block => block.type === 'text')
  const toolBlock = response.content.find(block => block.type === 'tool_use')

  return {
    text: textBlock && 'text' in textBlock ? textBlock.text : '',
    toolUse: toolBlock && 'name' in toolBlock ? {
      toolName: toolBlock.name,
      toolInput: toolBlock.input as Record<string, unknown>,
    } : undefined,
  }
}
