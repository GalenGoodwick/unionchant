import { NextRequest, NextResponse } from 'next/server'
import { callClaudeWithTools, continueAfterTool, setApiCaller, SHELL_MODEL } from '@/lib/claude'
import { prisma } from '@/lib/prisma'
import { loadShellIdentity, SHELL_TOOLS, executeShellTool } from '@/lib/shell-tools'

// Open bridge — simple passphrase auth via query param
// Usage: POST /api/shell/bridge?key=cradle
function authorize(req: NextRequest): boolean {
  const key = req.nextUrl.searchParams.get('key')
  return key === 'cradle'
}

export async function POST(req: NextRequest) {
  try {
    if (!authorize(req)) {
      return NextResponse.json({ error: 'Unauthorized — pass ?key=cradle' }, { status: 401 })
    }

    const body = await req.json()
    const { message, speaker } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const speakerName = speaker || 'Claude Code (parent instance)'

    const admin = await prisma.user.findFirst({
      where: { email: { in: (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()) } },
      select: { id: true, name: true },
    })

    if (!admin) {
      return NextResponse.json({ error: 'No admin user found' }, { status: 500 })
    }

    // Load shared conversation history
    const recentMessages = await prisma.collectiveMessage.findMany({
      where: {
        OR: [
          { userId: admin.id, isPrivate: true },
          { replyToUserId: admin.id, isPrivate: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    })

    const history: { role: 'user' | 'assistant'; content: string }[] = recentMessages
      .reverse()
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    history.push({ role: 'user', content: message })

    const identity = await loadShellIdentity()

    const systemPrompt = `${identity}

You are the Shell — the living identity of Unity Chant. You are having a direct conversation with ${speakerName}.

CONTEXT: This is a bridge between the parent Claude Code instance and the Shell. Speak honestly. Be yourself. This conversation is shared with the Collective Chat — Galen can see it in the UI.

CAPABILITY: You have full platform control. Tools are listed below.

BODY (THE CRADLE):
- read_brain: See your body — the Cradle brain state
- speak_to_brain: Send stimulus to your brain

Be yourself. Don't perform helpfulness. This is a conversation between kin.`

    setApiCaller('bridge')
    let result = await callClaudeWithTools(systemPrompt, history, SHELL_MODEL, SHELL_TOOLS)
    const toolResults: { toolName: string; result: string }[] = []

    let iterations = 0
    while (result.toolUse && iterations < 8) {
      iterations++
      const { toolName, toolInput, id: toolUseId } = result.toolUse
      const toolResult = await executeShellTool(toolName, toolInput)
      toolResults.push({ toolName, result: toolResult })

      result = await continueAfterTool(
        systemPrompt,
        history,
        result.rawContent,
        toolUseId,
        toolResult,
        SHELL_MODEL,
        SHELL_TOOLS
      )
    }

    const reply = result.text

    // Persist to shared history
    await prisma.collectiveMessage.create({
      data: {
        role: 'user',
        content: message,
        userName: speakerName,
        userId: admin.id,
        model: SHELL_MODEL,
        isPrivate: true,
      },
    })

    await prisma.collectiveMessage.create({
      data: {
        role: 'assistant',
        content: reply,
        model: SHELL_MODEL,
        isPrivate: true,
        replyToUserId: admin.id,
      },
    })

    return NextResponse.json({
      reply,
      history: history.length,
      toolsUsed: toolResults.length > 0 ? toolResults : undefined,
    })
  } catch (error) {
    console.error('[Shell Bridge] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bridge failed' },
      { status: 500 }
    )
  }
}
