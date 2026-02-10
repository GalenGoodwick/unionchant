import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { callClaude } from '@/lib/claude'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { question, description, count, useChat } = await req.json()
  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  }

  const ideaCount = Math.min(Math.max(count || 10, 2), 20)

  // Optionally pull collective chat history for context
  let chatContext = ''
  if (useChat) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (user) {
      const messages = await prisma.collectiveMessage.findMany({
        where: {
          OR: [
            { userId: user.id, isPrivate: true },
            { replyToUserId: user.id, isPrivate: true },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { role: true, content: true },
      })
      if (messages.length > 0) {
        chatContext = '\n\nThe user had this conversation with the Collective AI chat (most recent first):\n' +
          messages.reverse().map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n')
      }
    }
  }

  try {
    const systemPrompt = `You generate diverse, thoughtful ideas for collective deliberation. Return ONLY a JSON array of strings, no other text. Each idea should be a concise, actionable proposal (under 200 characters). Make them varied — cover different angles, approaches, and perspectives. Do not number them.`

    let userMsg = description?.trim()
      ? `Generate ${ideaCount} diverse ideas for this question:\n\n"${question.trim()}"\n\nContext: ${description.trim()}`
      : `Generate ${ideaCount} diverse ideas for this question:\n\n"${question.trim()}"`

    if (chatContext) {
      userMsg += chatContext + '\n\nUse the chat conversation to inform the ideas — draw from topics, themes, and suggestions discussed.'
    }

    const result = await callClaude(systemPrompt, [{ role: 'user', content: userMsg }], 'haiku')

    // Parse JSON array from response
    const match = result.match(/\[[\s\S]*\]/)
    if (!match) {
      return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
    }

    const ideas: string[] = JSON.parse(match[0])
    return NextResponse.json({ ideas: ideas.slice(0, ideaCount) })
  } catch {
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
  }
}
