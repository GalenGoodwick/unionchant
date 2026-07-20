#!/usr/bin/env node

import { createInterface } from 'readline'
import { writeFileSync, readFileSync, appendFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const PROD_URL = 'https://unionchant.vercel.app'

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function openBrowser(url) {
  try {
    const platform = process.platform
    if (platform === 'darwin') execSync(`open "${url}"`)
    else if (platform === 'win32') execSync(`start "" "${url}"`)
    else execSync(`xdg-open "${url}"`)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const command = process.argv[2]

  if (!command || command === 'help' || command === '--help') {
    console.log(`
  uc-space — Connect Claude Code to your Unity Chant engine space

  Usage:
    uc-space init              Authorize and set up CLAUDE.md (opens browser)
    uc-space init --token TOK  Set up with an existing token (no browser)
    uc-space test              Test your space token connection
    uc-space help              Show this help

  After running 'init', start Claude Code in this directory.
  Claude reads CLAUDE.md and knows how to program your space.
`)
    process.exit(0)
  }

  if (command === 'init') {
    await init()
  } else if (command === 'test') {
    await test()
  } else {
    console.error(`Unknown command: ${command}. Run 'uc-space help' for usage.`)
    process.exit(1)
  }
}

async function init() {
  console.log('\n  Unity Chant Space Setup\n')

  // Check for --token flag (manual mode)
  const tokenIdx = process.argv.indexOf('--token')
  const manualToken = tokenIdx !== -1 ? process.argv[tokenIdx + 1] : process.env.CHANT_SPACE_TOKEN

  // Server URL
  const serverUrlIdx = process.argv.indexOf('--url')
  const serverUrl = serverUrlIdx !== -1 ? process.argv[serverUrlIdx + 1] : PROD_URL

  let token, spaceSlug

  if (manualToken) {
    // Manual token mode — skip device auth
    token = manualToken
    if (!token.startsWith('uc_st_')) {
      console.error('  Invalid token. Space tokens start with uc_st_')
      process.exit(1)
    }

    console.log('  Testing token...')
    const data = await testToken(serverUrl, token)
    if (!data) process.exit(1)
    spaceSlug = data.spaceSlug
    console.log(`  Connected! ${data.fields?.length ?? 0} fields.`)
  } else {
    // Device auth flow — one click in browser
    const result = await deviceAuth(serverUrl)
    if (!result) process.exit(1)
    token = result.token
    spaceSlug = result.spaceSlug
  }

  // Write files
  await writeSetupFiles(serverUrl, token, spaceSlug)
}

async function deviceAuth(serverUrl) {
  // 1. Init device code
  console.log('  Starting authorization...')
  let initData
  try {
    const res = await fetch(`${serverUrl}/api/spaces/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init' }),
    })
    initData = await res.json()
    if (!res.ok) {
      console.error(`  Failed to start auth: ${initData.error || res.statusText}`)
      return null
    }
  } catch (err) {
    console.error(`  Can't reach ${serverUrl}: ${err.message}`)
    return null
  }

  const { deviceCode, pollSecret } = initData
  const authUrl = `${serverUrl}/space/connect?code=${deviceCode}`

  // 2. Open browser
  console.log(`\n  Code: ${deviceCode}\n`)
  const opened = openBrowser(authUrl)
  if (opened) {
    console.log('  Browser opened. Pick your space and click Connect.')
  } else {
    console.log(`  Open this URL in your browser:\n\n  ${authUrl}\n`)
    console.log('  Pick your space and click Connect.')
  }

  // 3. Poll for approval
  console.log('\n  Waiting for approval...')
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    await sleep(2000)
    try {
      const res = await fetch(
        `${serverUrl}/api/spaces/connect?code=${deviceCode}&secret=${pollSecret}`
      )
      const data = await res.json()

      if (data.status === 'completed') {
        console.log('  Authorized!\n')
        return { token: data.token, spaceSlug: data.spaceSlug }
      }
      if (data.error === 'expired' || data.error === 'expired_or_invalid') {
        console.error('  Code expired. Run init again.')
        return null
      }
      // Still pending — keep polling
      process.stdout.write('.')
    } catch {
      // Network blip — retry
    }
  }

  console.error('\n  Timed out. Run init again.')
  return null
}

async function testToken(serverUrl, token) {
  try {
    const res = await fetch(`${serverUrl}/api/engine/bridge`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error(`  Connection failed: ${err.error || res.statusText}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`)
    return null
  }
}

async function writeSetupFiles(serverUrl, token, spaceSlug) {
  // Write CLAUDE.md
  const claudeMd = generateClaudeMd(serverUrl, spaceSlug)
  const claudePath = join(process.cwd(), 'CLAUDE.md')

  if (existsSync(claudePath)) {
    const overwrite = await ask('  CLAUDE.md already exists. Overwrite? (y/N): ')
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Keeping existing CLAUDE.md.')
    } else {
      writeFileSync(claudePath, claudeMd)
      console.log(`  Wrote ${claudePath}`)
    }
  } else {
    writeFileSync(claudePath, claudeMd)
    console.log(`  Wrote ${claudePath}`)
  }

  // Write .env with token
  const envPath = join(process.cwd(), '.env')
  const envLine = `CHANT_SPACE_TOKEN=${token}`
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8')
    if (envContent.includes('CHANT_SPACE_TOKEN')) {
      // Replace existing
      const updated = envContent.replace(/^CHANT_SPACE_TOKEN=.*$/m, envLine)
      writeFileSync(envPath, updated)
      console.log('  Updated CHANT_SPACE_TOKEN in .env')
    } else {
      appendFileSync(envPath, `\n${envLine}\n`)
      console.log('  Appended CHANT_SPACE_TOKEN to .env')
    }
  } else {
    writeFileSync(envPath, `${envLine}\n`)
    console.log('  Wrote .env')
  }

  const viewUrl = spaceSlug ? `${serverUrl}/space/${spaceSlug}` : serverUrl
  console.log(`
  Ready! Start Claude Code:

    claude

  View your space live at: ${viewUrl}
`)
}

async function test() {
  const token = process.env.CHANT_SPACE_TOKEN
  if (!token) {
    console.error('  Set CHANT_SPACE_TOKEN environment variable first.')
    console.error('  Or run: uc-space init')
    process.exit(1)
  }

  const serverUrl = process.env.CHANT_SERVER_URL || PROD_URL
  console.log(`\n  Testing connection to ${serverUrl}...`)

  const data = await testToken(serverUrl, token)
  if (!data) process.exit(1)
  console.log(`  Connected! ${data.fields?.length ?? 0} fields in space.`)
  console.log(`  Space ID: ${data.spaceId || 'global'}`)
}

function generateClaudeMd(serverUrl, spaceSlug) {
  const viewUrl = spaceSlug ? `${serverUrl}/space/${spaceSlug}` : ''
  return `# Unity Chant Engine Space

You are programming a persistent WebGPU spatial engine space on Unity Chant.
Your changes render live in the browser${viewUrl ? ` at ${viewUrl}` : ''}.

## Connection

- **Bridge API**: ${serverUrl}/api/engine/bridge
- **Auth**: Bearer token from CHANT_SPACE_TOKEN env var (set in .env)

To send a command:
\`\`\`bash
curl -s -X POST ${serverUrl}/api/engine/bridge \\
  -H "Authorization: Bearer $CHANT_SPACE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"create_field","name":"Test","color":[1,0.5,0,1],"shape":"circle","radius":30,"x":256,"y":256}'
\`\`\`

To read current state:
\`\`\`bash
curl -s ${serverUrl}/api/engine/bridge \\
  -H "Authorization: Bearer $CHANT_SPACE_TOKEN" | jq .
\`\`\`

## Command Reference

### Fields
| Command | Key Parameters | Description |
|---------|---------------|-------------|
| \`create_field\` | \`name, color:[r,g,b,a], shape, radius/w/h, x, y, visualType?\` | Create a field |
| \`delete_field\` | \`fieldId\` | Remove a field |
| \`set_position\` | \`fieldId, x, y\` | Move field |
| \`set_color\` | \`fieldId, color:[r,g,b,a]\` | Change color (0.0-1.0) |
| \`set_scale\` | \`fieldId, scale\` | Scale field |
| \`clone_field\` | \`fieldId, name?, offsetX?, offsetY?\` | Duplicate |
| \`list_fields\` | — | List all fields |
| \`reset\` | — | Clear everything |

### Custom Visuals (WGSL Shaders)
| Command | Parameters | Description |
|---------|-----------|-------------|
| \`define_visual\` | \`name, wgsl\` | Register a visual shader |
| \`define_module\` | \`name, wgsl\` | Register reusable WGSL module |
| \`add_effect\` | \`fieldId, wgsl, blend?\` | Add shader effect to field |
| \`add_world_effect\` | \`wgsl, blend?\` | Add world-level post effect |

### Visual Shader Signature
\`\`\`wgsl
fn visual_NAME(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f, behind: vec4f) -> vec4f
\`\`\`
- \`uv\`: Local coordinates (-1 to 1, center=0)
- \`sdf\`: Signed distance to boundary (negative=inside)
- \`color\`: Field's RGBA color
- \`time\`: Seconds since engine start
- \`params\`: 4 custom floats from \`visualParams\`
- \`behind\`: Color of fields behind this one
- **Return**: RGBA (alpha=0 for transparent). Output HDR values >1.0 for bloom.

### Built-in WGSL Utilities (available in all shaders)
- **Noise**: \`vnoise(p)\`, \`gnoise(p)\`, \`simplex2d(p)\`, \`fbm3(p)\`...\`fbm6(p)\`
- **SDF**: \`sdCircle(p,r)\`, \`sdBox(p,b)\`, \`sdRoundedBox(p,b,r)\`, \`sdStar(p,r,n,m)\`
- **SDF Ops**: \`opSmoothUnion(d1,d2,k)\`, \`opSubtract(d1,d2)\`, \`opIntersect(d1,d2)\`
- **Color**: \`hsv2rgb(c)\`, \`palette(t,a,b,c,d)\`
- **Hash**: \`hash21(p)\`, \`hash22(p)\`
- **Math**: \`rotate(p,angle)\`, \`polar(uv)\`, \`glsl_mod(x,y)\`
- **Effects**: \`softGlow(uv,i,r)\`, \`ring(uv,r,w)\`, \`voronoiEdge(p,w)\`

### Physics & Interactions
| Command | Parameters | Description |
|---------|-----------|-------------|
| \`set_world_params\` | \`params: {gravity?, friction?, collisionForce?, boundaryMode?}\` | Physics |
| \`apply_force\` | \`fieldId, fx, fy\` | Impulse |
| \`define_interaction\` | \`rule: {trigger, effect, ...}\` | Collision/proximity rules |
| \`link_fields\` | \`fromFieldId, toFieldId, style?, color?\` | Visual beams |
| \`add_step_hook\` | \`hookId, author, description, code\` | JS each tick |

### Post-Processing
\`\`\`json
{"type":"set_world_data","data":{"postProcess":{"bloomIntensity":0.4,"bloomThreshold":0.5,"exposure":1.0}}}
\`\`\`

## WGSL Rules (not GLSL)
- \`let\` = immutable, \`var\` = mutable
- No implicit casts: use \`f32(intVal)\`
- No \`mod()\`: use \`glsl_mod(x,y)\`
- \`atan2(y,x)\` not \`atan(y,x)\`
- Conditions must be bool: \`if (x > 0.5)\` not \`if (x)\`
- Don't clamp to [0,1] — let HDR values through for bloom

## Example: Pulsing Circle
\`\`\`json
{"commands":[
  {"type":"define_visual","name":"pulse","wgsl":"fn visual_pulse(uv: vec2f, sdf: f32, color: vec4f, time: f32, params: vec4f, behind: vec4f) -> vec4f {\\n  let d = length(uv);\\n  let r = 0.3 + sin(time * 3.0) * 0.1;\\n  if (d > r) { return vec4f(0.0); }\\n  let bright = 1.0 - d / r;\\n  return vec4f(color.rgb * bright * 2.0, 1.0);\\n}"},
  {"type":"create_field","name":"Pulse","shape":"rect","x":256,"y":256,"width":200,"height":200,"visualType":"pulse","color":[0.2,0.8,0.4,1.0]}
]}
\`\`\`

## Tips
- Deploy visuals incrementally — one at a time. A WGSL error breaks ALL visuals.
- Use \`list_fields\` to see current state before making changes.
- Circle clip: add \`if (length(uv) > 0.97) { return vec4f(0.0); }\` at top of shaders.
- Keep FBM octaves to 3-4 for performance.
- The engine grid is 512x512. Center is (256, 256).
`
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
