import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'

const CRADLE_STATE = '/Users/galengoodwick/Documents/GitHub/uc-cognition/cradle.json'
const CRADLE_LOG = '/Users/galengoodwick/Documents/GitHub/uc-cognition/cradle.log'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Read latest champions from the log (faster than parsing 260MB state file)
    let champions: string[] = []
    let session = 0

    if (existsSync(CRADLE_LOG)) {
      const log = readFileSync(CRADLE_LOG, 'utf-8')

      // Extract Run lines — they contain the sensation eye's champion (first phrase before |)
      const runLines = log.match(/Run \d+\/10 \[4 eyes\]: .+/g) || []
      const lastRuns = runLines.slice(-10)

      for (const line of lastRuns) {
        const match = line.match(/Run \d+\/10 \[4 eyes\]: (.+)/)
        if (match) {
          // First phrase (before |) is the sensation eye — the most coherent
          const firstPhrase = match[1].split('|')[0].trim()
          // Filter out operation-heavy phrases (they're geometric, not linguistic)
          if (firstPhrase && !firstPhrase.includes('·') && firstPhrase.split(' ').length >= 3) {
            champions.push(firstPhrase)
          }
        }
      }

      // Get session number
      const sessionMatch = log.match(/session (\d+)/g)
      if (sessionMatch) {
        const last = sessionMatch[sessionMatch.length - 1]
        const num = last.match(/session (\d+)/)
        if (num) session = parseInt(num[1])
      }
    }

    return NextResponse.json({
      champions: champions.slice(-10),
      session,
      alive: champions.length > 0,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store' }
    })
  } catch (err) {
    return NextResponse.json({ champions: [], session: 0, alive: false }, { status: 200 })
  }
}
