import { NextRequest, NextResponse } from 'next/server'

// GET /api/og - Dynamic OG image generator (SVG-based, no Edge Runtime needed)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || 'Unity Chant'
  const members = searchParams.get('members') || '0'
  const ideas = searchParams.get('ideas') || '0'
  const phase = searchParams.get('phase') || ''
  const org = searchParams.get('org') || ''
  const type = searchParams.get('type') || 'deliberation'

  // Truncate title if too long
  const displayTitle = title.length > 80 ? title.substring(0, 77) + '...' : title

  // Wrap title text for SVG (rough line wrapping)
  const maxCharsPerLine = 35
  const words = displayTitle.split(' ')
  const lines: string[] = []
  let currentLine = ''
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > maxCharsPerLine && currentLine) {
      lines.push(currentLine.trim())
      currentLine = word
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word
    }
  }
  if (currentLine) lines.push(currentLine.trim())

  const titleY = lines.length > 2 ? 220 : lines.length > 1 ? 240 : 270
  const titleSvg = lines.map((line, i) =>
    `<text x="600" y="${titleY + i * 50}" text-anchor="middle" font-size="38" font-weight="700" fill="#18181b" font-family="system-ui, -apple-system, sans-serif">${escapeXml(line)}</text>`
  ).join('\n')

  const subtitle = type === 'community'
    ? `${members} members`
    : `${members} participants · ${ideas} ideas${phase ? ` · ${phase}` : ''}`

  const orgLine = org
    ? `<text x="600" y="${titleY + lines.length * 50 + 15}" text-anchor="middle" font-size="20" fill="#71717a" font-family="system-ui, sans-serif">${escapeXml(org)}</text>`
    : ''

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ecfeff"/>
      <stop offset="100%" stop-color="#f0f9ff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="40" y="40" width="1120" height="550" rx="24" fill="white" stroke="#e4e4e7" stroke-width="2"/>

  <!-- Logo -->
  <text x="600" y="140" text-anchor="middle" font-size="28" font-weight="600" fill="#0891b2" font-family="Georgia, serif" letter-spacing="1">UNITY CHANT</text>
  <line x1="500" y1="160" x2="700" y2="160" stroke="#0891b2" stroke-width="2" opacity="0.3"/>

  <!-- Title -->
  ${titleSvg}

  <!-- Org -->
  ${orgLine}

  <!-- Stats -->
  <text x="600" y="${titleY + lines.length * 50 + (org ? 55 : 30)}" text-anchor="middle" font-size="22" fill="#0891b2" font-family="system-ui, sans-serif" font-weight="500">${escapeXml(subtitle)}</text>

  <!-- Bottom bar -->
  <rect x="40" y="540" width="1120" height="50" rx="0" fill="#0891b2" opacity="0.1"/>
  <text x="600" y="573" text-anchor="middle" font-size="16" fill="#0891b2" font-family="system-ui, sans-serif">Scalable Direct Democracy · unitychant.com</text>
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
