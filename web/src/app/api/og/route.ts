import { NextRequest, NextResponse } from 'next/server'

// GET /api/og - Dynamic OG image generator (SVG-based, no Edge Runtime needed)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || ''
  const members = searchParams.get('members') || '0'
  const ideas = searchParams.get('ideas') || '0'
  const phase = searchParams.get('phase') || ''
  const org = searchParams.get('org') || ''
  const type = searchParams.get('type') || 'deliberation'

  // Homepage branding - no title means use full hero
  if (!title || title === 'Unity Chant') {
    return new NextResponse(generateHomepageOG(), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  }

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

function generateHomepageOG(): string {
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="darkBg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="goldGlow" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#e8b84b" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#e8b84b" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Dark background -->
  <rect width="1200" height="630" fill="url(#darkBg)"/>

  <!-- Constellation pattern (left side) -->
  <!-- Gold dot -->
  <circle cx="180" cy="315" r="18" fill="#e8b84b" opacity="0.9"/>
  <circle cx="180" cy="315" r="35" fill="url(#goldGlow)"/>

  <!-- Blue dots -->
  <circle cx="320" cy="240" r="13" fill="#3b82f6" opacity="0.8"/>
  <circle cx="340" cy="315" r="13" fill="#3b82f6" opacity="0.8"/>
  <circle cx="320" cy="390" r="13" fill="#3b82f6" opacity="0.8"/>

  <!-- Pink dots -->
  <circle cx="440" cy="200" r="9" fill="#ec4899" opacity="0.7"/>
  <circle cx="450" cy="240" r="9" fill="#ec4899" opacity="0.7"/>
  <circle cx="460" cy="280" r="9" fill="#ec4899" opacity="0.7"/>
  <circle cx="460" cy="350" r="9" fill="#ec4899" opacity="0.7"/>
  <circle cx="450" cy="390" r="9" fill="#ec4899" opacity="0.7"/>
  <circle cx="440" cy="430" r="9" fill="#ec4899" opacity="0.7"/>

  <!-- Connection lines -->
  <line x1="180" y1="315" x2="320" y2="240" stroke="#e8b84b" stroke-width="2" opacity="0.3"/>
  <line x1="180" y1="315" x2="340" y2="315" stroke="#e8b84b" stroke-width="2" opacity="0.3"/>
  <line x1="180" y1="315" x2="320" y2="390" stroke="#e8b84b" stroke-width="2" opacity="0.3"/>

  <!-- Right side text -->
  <!-- Brand name -->
  <text x="650" y="260" font-size="64" font-weight="700" font-family="Georgia, serif">
    <tspan fill="#e8b84b">Unity</tspan>
    <tspan fill="#3b82f6" dx="20">Chant</tspan>
  </text>

  <!-- Tagline -->
  <text x="650" y="305" font-size="20" fill="#94a3b8" font-family="Georgia, serif" font-style="italic" letter-spacing="1">Holding Quiet Hope</text>

  <!-- Hero message -->
  <text x="650" y="370" font-size="28" font-weight="600" fill="#ffffff" font-family="system-ui, sans-serif">Direct democracy through</text>
  <text x="650" y="405" font-size="28" font-weight="600" fill="#ffffff" font-family="system-ui, sans-serif">small-group deliberation</text>

  <!-- Bottom text -->
  <text x="600" y="580" text-anchor="middle" font-size="16" fill="#64748b" font-family="system-ui, sans-serif">Durable consensus at scale · unitychant.com</text>
</svg>`
}
