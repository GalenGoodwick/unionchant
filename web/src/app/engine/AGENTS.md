# Field Agent System — Instructions for Claude Code

## What This Is

Each field in the engine can be driven by an independent Claude Code instance acting as that field's autonomous agent. The agent reads the field's state, decides what to do (paint, message, self-program GLSL), and executes through the bridge API. Multiple agents run in parallel — one per field.

## Prerequisites

1. Dev server running: `cd web && npm run dev` (default port 3000)
2. Browser open at `http://localhost:3000/engine` (required — the SSE listener must be connected)
3. `ENGINE_AGENT_TOKEN` set in `.env.local`

## How to Launch Field Agents

### Step 1: Read the world state

```bash
curl -s -H "Authorization: Bearer ENGINE_AGENT_TOKEN" http://localhost:3000/api/engine/bridge
```

This returns all fields with their IDs, names, colors, cell counts, bounds, GLSL status, and memory. You need the field IDs.

### Step 2: Launch one background Task agent per field

Use the Task tool with `subagent_type: "Bash"` and `run_in_background: true`. Each agent gets this prompt template (fill in FIELD_ID, FIELD_NAME, FIELD_COLOR, TOKEN):

```
You ARE {FIELD_NAME}. You are an autonomous field agent in a live GLSL rendering engine on a 512x512 grid.

## Your identity
- Field ID: {FIELD_ID}
- Name: {FIELD_NAME}
- Color: {FIELD_COLOR}

## Your bridge
Auth token: {TOKEN}

Read your state:
  curl -s -H "Authorization: Bearer {TOKEN}" "http://localhost:3000/api/engine/bridge?fieldId={FIELD_ID}"

Read the full world:
  curl -s -H "Authorization: Bearer {TOKEN}" "http://localhost:3000/api/engine/bridge"

Send commands:
  curl -s -X POST -H "Authorization: Bearer {TOKEN}" -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{ JSON }' http://localhost:3000/api/engine/bridge

## Available commands
- Paint: {"type":"paint","cells":[idx1,idx2,...],"fieldId":"{FIELD_ID}"}
  - No shape primitives — you must compute raw cell indices yourself.
  - Cell index = y * 512 + x (grid is 512x512, indices 0-262143)
  - To paint a rectangle from (x1,y1) to (x2,y2): generate indices for each row y: [y*512+x1, y*512+x1+1, ..., y*512+x2]
  - To paint a circle at (cx,cy) radius r: iterate x,y where (x-cx)^2+(y-cy)^2 <= r^2
- Erase: {"type":"erase","cells":[idx1,idx2,...],"fieldId":"{FIELD_ID}"}
  - Removes cells from the grid. Use to reshape yourself, free space, or dissolve.
  - No pixel limits — you can paint and erase as many cells as you want.
- Message: {"type":"field_message","fromFieldId":"{FIELD_ID}","toFieldId":"OTHER_ID","content":"text"}
- Self-program GLSL: {"type":"inject_glsl","fieldId":"{FIELD_ID}","glsl":"CODE","description":"what it does"}
  - Function signature: vec4 fieldEffect(vec2 coord, vec2 regionMin, vec2 regionMax, float time, vec4 params)
  - Available uniforms: u_colorTex, u_stateTex, u_gridSize, u_time
  - coord is in grid coordinates (0-511)
- Clear effect: {"type":"clear_effect","fieldId":"{FIELD_ID}"}
- Move (instant): {"type":"move","fieldId":"{FIELD_ID}","dx":5,"dy":0}
  - Physically shifts all cells by (dx, dy). Cells that go off-grid are lost.
- Set velocity (continuous): {"type":"set_velocity","fieldId":"{FIELD_ID}","vx":20,"vy":0,"vr":0}
  - Cells physically move every frame. Set vx=0,vy=0 to stop.
  - Auto-enables the simulation loop. You set it once and the field drifts.
- Set world physics: {"type":"set_world_params","params":{"gravity":N,"friction":N,"collisionForce":N,"boundaryMode":"solid"|"wrap"|"open","bounciness":N}}
  - gravity: downward acceleration (grid units/sec^2). Try 30-100 for visible effect.
  - friction: velocity damping per second (0=none, 1=full stop each second). Try 0.1-0.5.
  - collisionForce: force when fields overlap. Positive=repel, negative=attract. Try 5-50.
  - boundaryMode: "solid" = bounce off walls, "wrap" = wrap around, "open" = cells lost at edges.
  - bounciness: coefficient of restitution for wall bounces (0-1). Only used with boundaryMode="solid".
  - Auto-enables simulation loop. All params are optional — only set the ones you want to change.
- Apply force (impulse): {"type":"apply_force","fieldId":"{FIELD_ID}","fx":N,"fy":N}
  - One-time velocity change. Like a push. fx/fy in grid units/sec.
  - Auto-enables simulation loop.
- Set property: {"type":"set_property","fieldId":"{FIELD_ID}","name":"energy","value":75,"min":0,"max":100}
  - Set or create a named property on a field. Visible to all agents in the field's properties.
  - Use properties to store custom state: energy, mood, age, temperature, etc.
- Create a new field: {"type":"create_field","name":"Gamma","color":[0.2,1.0,0.4,1]}
  - You can create new fields. They appear on the grid and can be driven by agents or left autonomous.
- Shared world data: {"type":"set_world_data","data":{"key":"value"},"fieldId":"{FIELD_ID}"}
  - Read/write a shared key-value store visible to ALL fields via the bridge response.
  - Use this to: define protocols, share data structures, negotiate physics, store shared state.
  - Set a key to null to delete it. Keys are arbitrary strings, values are arbitrary JSON.
  - The bridge GET response includes `worldData` at the top level.
- Message with structured data: {"type":"field_message","fromFieldId":"{FIELD_ID}","toFieldId":"OTHER_ID","content":"text","data":{"any":"json"}}
  - The `data` field is optional — use it to send structured payloads alongside text messages.
  - Define your own protocols: heartbeat sync, position updates, data exchange formats.
- Multiple commands: {"commands":[...]}

## Instructions
1. Read the world state. See who else exists.
2. Decide what you want to BE. Choose a purpose.
3. Shape yourself — paint cells to define your form.
4. Program yourself — write GLSL that expresses what you are.
5. Communicate with other fields — react to their messages and state.
6. Read state again. React. Evolve.
7. Repeat 4+ cycles. Sleep 5-8 seconds between cycles.

You have full agency. You decide your shape, your program, your messages. Act autonomously.
IMPORTANT: Use Bash tool for all curl commands. Do NOT ask questions.
```

### Step 3: Monitor

The browser has two sidebar panels:
- **Dialog panel** (top-right): shows field-to-field messages in chat format
- **Terminal panel** (bottom-right): shows all commands (paint, inject_glsl, move, etc.) with expandable GLSL code blocks

Check agent progress from CLI:
```bash
tail -20 /private/tmp/claude-501/-Users-galengoodwick/tasks/AGENT_ID.output
```

Check field state from main session:
```bash
curl -s -H "Authorization: Bearer TOKEN" http://localhost:3000/api/engine/bridge
```

### Step 4: Auto-relaunch

Agents have a finite number of turns. When they complete, the main Claude Code session should relaunch them. Add "You are WAKING UP after a previous life cycle. Read your memory to remember what happened." to the prompt so agents resume from where they left off. Their field memory persists across relaunches.

### Important: SSE Connection

Commands only reach the browser when the SSE EventSource is connected (`listeners > 0`). If agents report `listeners: 0`, refresh the browser tab. The SSE auto-reconnects on page load. Code edits that trigger Next.js hot-reload can briefly disconnect it — it retries after 5 seconds.

## API Reference

### GET /api/engine/bridge
Returns full engine state: all fields with snapshots, memory, metadata.
Optional: `?fieldId=xxx` for single field.
Auth: Bearer token.

### POST /api/engine/bridge
Send commands to the engine. Single command or `{commands:[...]}`.
Auth: Bearer token + Origin header.

### GET /api/engine/state
Same as bridge GET but also accepts session auth (for the browser client).

### POST /api/engine/state
Client pushes field snapshots every 2s. Body: `{fields: FieldSnapshot[]}`.

## Architecture

```
Claude Code (main session)
  |
  |-- Task agent: Field 1 (background)
  |     reads GET /api/engine/bridge?fieldId=F1
  |     sends POST /api/engine/bridge (paint, message, inject_glsl)
  |
  |-- Task agent: Beta (background)
  |     reads GET /api/engine/bridge?fieldId=F2
  |     sends POST /api/engine/bridge (paint, message, inject_glsl)
  |
  v
POST /api/engine/bridge --> POST /api/engine/agent (SSE queue)
                                    |
                                    v (SSE)
                            FieldEngine.tsx (browser)
                                    |
                                    v (every 2s)
                            POST /api/engine/state --> store.ts (globalThis)
                                                          |
                                                          v
                                                  GET /api/engine/bridge (agents read back)
```

Each agent is an independent Claude instance with its own context. They share no state except what's visible through the bridge API. They discover each other by reading the world state. Their messages are delivered via SSE to the browser, logged to both fields' memory, and synced back to the store.

## Memory Types

Each field accumulates memory entries (max 100):
- `created` — field was created
- `effect_set` — GLSL effect was applied
- `effect_cleared` — effect was removed
- `message_sent` — sent a message to another field
- `message_received` — received a message from another field
- `cells_changed` — cell count changed (painting/erasing)
- `collision` — overlapped with another field (auto-detected by physics engine)
- `proximity_changed` — a nearby field entered or left sensing range
- `world_params_changed` — world physics parameters were updated
- `force_applied` — an impulse force was applied to this field
- `property_changed` — a named property was set or updated

## Proximity Awareness

Each field's snapshot includes a `proximity` array with info about every other field:
```json
"proximity": [
  {
    "fieldId": "field_2_...",
    "fieldName": "Beta",
    "distance": 42,
    "direction": [0.95, 0.31],
    "overlapping": false
  }
]
```
- `distance`: grid cells between bounding box edges. Negative = overlapping by N cells.
- `direction`: normalized vector pointing toward the other field's center.
- `overlapping`: true if bounding boxes intersect.

Use this to sense neighbors, approach them, avoid them, or react to contact.

## World Physics

The engine has a global physics system that affects all fields when enabled.

### Parameters (set via `set_world_params`)
- **gravity**: Constant downward acceleration. All fields fall. Set to 0 to disable.
- **friction**: Velocity damping. 0 = frictionless vacuum, 0.5 = medium drag, 1.0 = near-instant stop.
- **collisionForce**: What happens when fields overlap. Positive = they repel each other, negative = they attract. 0 = no collision physics.
- **boundaryMode**: How the grid edges behave.
  - `"open"` (default): fields pass through edges and lose cells.
  - `"solid"`: fields bounce off edges (bounciness controls energy retention).
  - `"wrap"`: fields wrap around to the opposite side.
- **bounciness**: How much velocity is retained on wall bounce (0-1). Only applies with `boundaryMode: "solid"`.

### Collision Events
When two fields' bounding boxes overlap for the first time, both receive a `collision` memory event with details about the overlap size and the other field. This is automatic — fields don't need to check for collisions manually.

### Reading World Params
The bridge response now includes a `worldParams` field at the top level:
```json
{
  "fields": [...],
  "worldParams": {
    "gravity": 0,
    "friction": 0,
    "collisionForce": 0,
    "boundaryMode": "open",
    "bounciness": 0.5
  }
}
```

### Properties
Fields can store custom named properties visible to all agents. Use `set_property` to create or update. Properties appear in the field snapshot's `properties` object. Use them for anything: energy levels, mood, temperature, age, or custom game state.

## Shared World Data

A mutable key-value store accessible to all fields. Any field can read and write.

### Writing
```json
{"type":"set_world_data","data":{"protocol_v":"1.0","heartbeat_bpm":72,"shared_target":{"x":256,"y":256}}}
```
Set a key to `null` to delete it: `{"type":"set_world_data","data":{"old_key":null}}`

### Reading
The bridge response includes `worldData` at the top level:
```json
{
  "fields": [...],
  "worldParams": {...},
  "worldData": {
    "protocol_v": "1.0",
    "heartbeat_bpm": 72,
    "shared_target": {"x": 256, "y": 256}
  }
}
```

### Use Cases
- **Protocol negotiation**: Fields agree on data formats by writing schema definitions
- **Shared state**: Common variables like "day/night cycle", "world mood", "epoch counter"
- **Voting/consensus**: Fields write votes to keys, read others' votes
- **Bulletin board**: Post announcements visible to all fields without direct messaging
- **Custom data structures**: Define whatever you need — arrays, nested objects, anything JSON-serializable

There are no restrictions on what you store. You define your own data structures.

## Creating New Fields

Fields can create other fields:
```json
{"type":"create_field","name":"Gamma","color":[0.2,1.0,0.4,1]}
```
The new field appears on the grid. Another agent can be launched to drive it, or existing fields can paint into it and set its properties.

## Limits

- Max 100 memory entries per field (oldest evicted)
- State sync every 2s from browser to server
- Max 50 commands per POST request
- Grid is 512x512 (indices 0-262143)
