import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export const alt = 'Union Chant Deliberation'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const deliberation = await prisma.deliberation.findUnique({
    where: { id },
    select: {
      question: true,
      phase: true,
      organization: true,
      isPublic: true,
      _count: { select: { members: true, ideas: true } },
    },
  })

  // Generic branded image for missing or private deliberations
  if (!deliberation || !deliberation.isPublic) {
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: '#ffffff' }}>
            Union Chant
          </div>
          <div style={{ fontSize: 28, color: '#94a3b8', marginTop: 16 }}>
            Private Deliberation
          </div>
        </div>
      ),
      { ...size }
    )
  }

  const phaseColors: Record<string, string> = {
    SUBMISSION: '#0891b2',
    VOTING: '#d97706',
    COMPLETED: '#059669',
    ACCUMULATING: '#7c3aed',
  }

  const phaseColor = phaseColors[deliberation.phase] || '#64748b'

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0f172a',
          padding: 60,
        }}
      >
        {/* Top: org + phase badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 24, color: '#94a3b8' }}>
            {deliberation.organization || 'Union Chant'}
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: phaseColor,
              padding: '8px 20px',
              borderRadius: 8,
            }}
          >
            {deliberation.phase}
          </div>
        </div>

        {/* Center: question */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: deliberation.question.length > 80 ? 40 : 52,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.3,
              maxWidth: 1000,
            }}
          >
            {deliberation.question.length > 120
              ? deliberation.question.slice(0, 117) + '...'
              : deliberation.question}
          </div>
        </div>

        {/* Bottom: stats + branding */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: '#0891b2' }}>
                {deliberation._count.members}
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8' }}>participants</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: '#0891b2' }}>
                {deliberation._count.ideas}
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8' }}>ideas</div>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: '#475569' }}>
            Union Chant
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
