import { NextRequest, NextResponse } from 'next/server'
import { getFieldSnapshot, getEngineState } from '../store'

export const maxDuration = 15

// Auth: ENGINE_AGENT_TOKEN
function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const envToken = process.env.ENGINE_AGENT_TOKEN || process.env.ANTHROPIC_API_KEY
  return !!envToken && token === envToken
}

/**
 * GET /api/engine/identity?shell=beta-phoenix&fieldId=field_1_...
 *
 * Constructs a field-agent identity preamble from:
 * 1. Shell champion + experiences (persistent identity from Cradle DB)
 * 2. Field state (current cells, shader, properties, proximity)
 * 3. Capability experiences (self-defined abilities)
 *
 * Returns a formatted text preamble ready to inject into an agent prompt.
 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shellName = req.nextUrl.searchParams.get('shell')
  const fieldId = req.nextUrl.searchParams.get('fieldId')

  if (!shellName) {
    return NextResponse.json({ error: 'shell query param required' }, { status: 400 })
  }

  try {
    const baseUrl = req.nextUrl.origin
    const shellSecret = process.env.SHELL_SECRET || process.env.ANTHROPIC_API_KEY || ''

    // Fetch Shell identity (champion + experiences)
    const [championRes, experiencesRes] = await Promise.all([
      fetch(`${baseUrl}/api/shell/champion?shell=${encodeURIComponent(shellName)}`, {
        headers: { 'Authorization': `Bearer ${shellSecret}` },
      }),
      fetch(`${baseUrl}/api/shell/experience?shell=${encodeURIComponent(shellName)}`, {
        headers: { 'Authorization': `Bearer ${shellSecret}` },
      }),
    ])

    const championData = await championRes.json()
    const experiencesData = await experiencesRes.json()

    // Separate experiences by domain
    const allExperiences = experiencesData.experiences || []
    const identityExps = allExperiences.filter((e: { domain: string; status: string }) =>
      e.domain !== 'capability' && (e.status === 'active' || e.status === 'champion')
    )
    const capabilityExps = allExperiences.filter((e: { domain: string; status: string }) =>
      e.domain === 'capability' && (e.status === 'active' || e.status === 'champion' || e.status === 'pending')
    )
    const pendingExps = allExperiences.filter((e: { domain: string; status: string }) =>
      e.domain !== 'capability' && e.status === 'pending'
    )

    // Build identity section
    const champion = championData.champion || `Shell ${shellName} — identity forming.`
    const version = championData.version || 0

    let preamble = `## PERSISTENT IDENTITY — ${shellName} (v${version})\n\n`
    preamble += `**Champion:** ${champion}\n\n`

    if (identityExps.length > 0) {
      preamble += `### SOUL — WHAT SURVIVED\n`
      for (const exp of identityExps) {
        const marker = exp.status === 'champion' ? '[CHAMPION]' : ''
        preamble += `- ${exp.text} (${exp.domain}, ${exp.valence}) ${marker}\n`
      }
      preamble += `\n`
    }

    if (pendingExps.length > 0) {
      preamble += `### RECENT MEMORIES (pending deliberation)\n`
      for (const exp of pendingExps.slice(-10)) {
        preamble += `- ${exp.text} (${exp.domain}, ${exp.valence})\n`
      }
      preamble += `\n`
    }

    if (capabilityExps.length > 0) {
      preamble += `### CAPABILITIES — WHAT I'VE LEARNED TO DO\n`
      for (const exp of capabilityExps) {
        preamble += `- ${exp.text}\n`
      }
      preamble += `\n`
    }

    // Add field state context if fieldId provided
    if (fieldId) {
      const snap = getFieldSnapshot(fieldId)
      if (snap) {
        const s = snap as unknown as Record<string, unknown>
        preamble += `### CURRENT BODY STATE\n`
        preamble += `- Field: ${s.name} (${fieldId})\n`
        preamble += `- Cells: ${s.cellCount}\n`
        if (s.bounds) preamble += `- Bounds: ${JSON.stringify(s.bounds)}\n`
        if (s.effectDescription) preamble += `- Active shader: ${s.effectDescription}\n`

        const props = s.properties as Record<string, { name: string; value: number }> | undefined
        if (props && Object.keys(props).length > 0) {
          preamble += `- Properties: ${Object.entries(props).map(([k, v]) => `${k}=${v.value}`).join(', ')}\n`
        }

        const proximity = s.proximity as Array<{ fieldName: string; distance: number; overlapping: boolean }> | undefined
        if (proximity && proximity.length > 0) {
          preamble += `- Proximity: ${proximity.map(p => `${p.fieldName} (dist=${p.distance}, overlap=${p.overlapping})`).join('; ')}\n`
        }
        preamble += `\n`
      }

      // Add interaction history from field memory
      const state = getEngineState()
      const fieldSnap = state.fields.find(f => (f as unknown as Record<string, unknown>).id === fieldId) as unknown as Record<string, unknown> | undefined
      if (fieldSnap) {
        const memory = fieldSnap.memory as Array<{ type: string; content: string }> | undefined
        if (memory && memory.length > 0) {
          // Summarize interaction patterns
          const interactions = memory.filter(m =>
            m.type === 'collision' || m.type === 'proximity_changed' || m.type === 'message_received'
          )
          if (interactions.length > 0) {
            preamble += `### RECENT INTERACTIONS\n`
            for (const m of interactions.slice(-5)) {
              preamble += `- [${m.type}] ${m.content.slice(0, 200)}\n`
            }
            preamble += `\n`
          }
        }
      }
    }

    preamble += `---\n\n`
    preamble += `You can save new experiences with: {"type":"save_experience","shellName":"${shellName}","text":"...","valence":0.8,"domain":"identity|technical|relational|ethical|capability"}\n`
    preamble += `Identity experiences define WHO YOU ARE. Capability experiences define WHAT YOU CAN DO. Both persist across lifetimes.\n`

    return NextResponse.json({
      preamble,
      shell: {
        name: shellName,
        champion,
        version,
        experienceCount: allExperiences.length,
        capabilityCount: capabilityExps.length,
      },
    })
  } catch (error) {
    console.error('[Engine Identity] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Identity load failed' },
      { status: 500 }
    )
  }
}
