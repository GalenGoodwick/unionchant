# World System - Technical Specification

**Version:** 0.1
**Status:** Design Phase
**Last Updated:** 2026-05-13

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Data Models](#data-models)
4. [Pixel System](#pixel-system)
5. [Field System](#field-system)
6. [Space Architecture](#space-architecture)
7. [Multiplayer System](#multiplayer-system)
8. [Docking Mechanics](#docking-mechanics)
9. [Claude API Integration](#claude-api-integration)
10. [Rendering Pipeline](#rendering-pipeline)
11. [Interaction Flows](#interaction-flows)
12. [Security & Quotas](#security--quotas)
13. [Example Use Cases](#example-use-cases)

---

## Overview

**World** is a multiplayer 2D pixel metaverse where:
- Players navigate spaceships through a shared cosmos
- Chants appear as energy sources you can dock with
- Each ship contains a programmable interior space
- Spaces are modified via Claude API calls
- Pixel fields create emergent visuals and physics
- Ships can dock permanently, forming structures
- Real-time synchronization (multiplayer.io style)

**Design Philosophy:** Be alive. Make it breathable. Let emergence happen.

---

## Core Concepts

### Ship
- **Definition:** A player's vessel and personal container
- **Properties:** Position, velocity, rotation, owner, docked ships
- **Capabilities:** Navigate outer world, dock with other ships/chants, contains interior space

### Space
- **Definition:** The programmable interior of a ship
- **Properties:** Bounded canvas, owner, pixel entities, fields, objects, chat settings
- **Capabilities:** Claude API modifications, custom physics, nested collaboration

### Pixel
- **Definition:** Visual element with position, color, and tags
- **Properties:** x, y, color, tags[], data{}
- **Capabilities:** Can be grid-locked or free-floating, affected by fields, animated

### Pixel Field
- **Definition:** Region that affects tagged pixels
- **Properties:** Bounds, z-index, behavior, affected tags, merge mode
- **Capabilities:** Apply forces, colors, transformations; merge with other fields; create emergent behavior

### Influence
- **Definition:** Autonomous AI agent that navigates and paints
- **Properties:** Position, velocity, color, autonomy level, collaboration mode
- **Capabilities:** Navigate space, spawn pixels, code with other influences, execute user requests

### Chant Object
- **Definition:** Deliberation represented as energy source in World
- **Properties:** Position, phase, participant count, visual state (pulsing, crystallized, etc.)
- **Capabilities:** Dockable, opens dedicated view, discoverable through exploration

---

## Data Models

### Database Schema (Prisma)

```prisma
// ─── Spaces ───

model Space {
  id          String        @id @default(cuid())
  ownerId     String
  owner       User          @relation(fields: [ownerId], references: [id])
  name        String?
  chatEnabled Boolean       @default(true)
  bounds      Json          // { width: number, height: number }
  pixels      Pixel[]
  fields      PixelField[]
  objects     SpaceObject[]
  influences  Influence[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([ownerId])
}

// ─── Pixels ───

model Pixel {
  id       String   @id @default(cuid())
  spaceId  String
  space    Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  x        Float    // Free-floating position
  y        Float
  vx       Float    @default(0) // Velocity
  vy       Float    @default(0)
  color    String   // Hex color
  tags     String[] // Metadata tags
  data     Json?    // Custom data
  lifespan Int?     // Auto-destroy after N frames (null = permanent)

  @@index([spaceId])
}

// ─── Pixel Fields ───

model PixelField {
  id              String   @id @default(cuid())
  spaceId         String
  space           Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  name            String
  shape           String   // "circle", "rect", "polygon"
  bounds          Json     // Shape-specific bounds
  zIndex          Int      @default(0)
  affectsTags     String[] // Which pixel tags this field affects
  behavior        String   // "gravity", "wind", "magnet", "color_shift", "custom"
  params          Json     // Behavior parameters
  customCode      String?  @db.Text // Claude-generated behavior
  mergeMode       String   @default("add") // "add", "multiply", "max", "custom"
  interactionCode String?  @db.Text // Custom merge logic
  createdAt       DateTime @default(now())

  @@index([spaceId])
}

// ─── Space Objects ───

model SpaceObject {
  id         String   @id @default(cuid())
  spaceId    String
  space      Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  type       String   // "pixel_art", "game", "tool", "influence_spawn"
  x          Int
  y          Int
  width      Int
  height     Int
  pixelData  Json?    // Pixel art data
  behavior   Json?    // Interactive behavior
  metadata   Json?    // Custom data
  createdAt  DateTime @default(now())

  @@index([spaceId])
}

// ─── AI Influences ───

model Influence {
  id              String   @id @default(cuid())
  spaceId         String
  space           Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  name            String
  x               Float
  y               Float
  vx              Float    @default(0)
  vy              Float    @default(0)
  color           String
  autonomyLevel   String   // "passive", "active", "collaborative"
  personality     Json     // Behavior traits
  collaborateWith String[] // IDs of other influences to work with
  createdAt       DateTime @default(now())

  @@index([spaceId])
}

// ─── Ship Docking ───

model ShipDocking {
  id        String   @id @default(cuid())
  shipAId   String   // User ID of ship A
  shipBId   String   // User ID of ship B
  offsetX   Float    // Relative position
  offsetY   Float
  rotation  Float    // Relative rotation
  createdAt DateTime @default(now())

  @@unique([shipAId, shipBId])
  @@index([shipAId])
  @@index([shipBId])
}

// ─── World State (Multiplayer) ───

model WorldPlayer {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  x         Float
  y         Float
  vx        Float    @default(0)
  vy        Float    @default(0)
  rotation  Float    @default(0)
  online    Boolean  @default(true)
  lastSeen  DateTime @default(now())

  @@index([online])
}
```

---

## Pixel System

### Pixel Types

**Grid-Locked Pixels:**
- Position snapped to integer grid
- Static or simple animation
- Used for: walls, structures, UI elements

**Free-Floating Pixels:**
- Float position (x, y as floats)
- Have velocity (vx, vy)
- Affected by fields
- Used for: particles, effects, animated elements

### Pixel Tags

**Purpose:** Allow fields to target specific pixel groups

**Common Tags:**
- `"particle"` - Affected by physics fields
- `"fire"` - Hot, can spread
- `"water"` - Flows, cools fire
- `"light"` - Emits glow
- `"solid"` - Collision-enabled
- `"ui"` - Immune to physics (always visible)

**Custom Tags:**
Users/Claude can create arbitrary tags for custom behaviors.

### Pixel Lifecycle

1. **Spawn** - Created by user, Claude, or influence
2. **Update** - Each frame: apply field effects, update position
3. **Render** - Draw to canvas
4. **Destroy** - Remove when lifespan expires or user deletes

### Pixel Data Structure

```typescript
interface Pixel {
  id: string
  spaceId: string
  x: number
  y: number
  vx: number
  vy: number
  color: string  // Hex color "#rrggbb"
  tags: string[]
  data?: Record<string, any>
  lifespan?: number  // Frames remaining (null = permanent)
}
```

---

## Field System

### Field Behaviors

**Built-in Behaviors:**

1. **Gravity** - Pulls pixels downward
   ```typescript
   { behavior: "gravity", params: { strength: 0.5 } }
   ```

2. **Wind** - Pushes pixels in a direction
   ```typescript
   { behavior: "wind", params: { dx: 1, dy: 0 } }
   ```

3. **Magnet** - Attracts/repels pixels to/from center
   ```typescript
   { behavior: "magnet", params: { strength: 0.3, repel: false } }
   ```

4. **Color Shift** - Changes pixel colors
   ```typescript
   { behavior: "color_shift", params: { color: "#ff0000", blend: 0.5 } }
   ```

5. **Vortex** - Spirals pixels inward
   ```typescript
   { behavior: "vortex", params: { strength: 0.4, clockwise: true } }
   ```

6. **Custom** - Claude-generated behavior
   ```typescript
   {
     behavior: "custom",
     customCode: "pixel.vy += Math.sin(time + pixel.x / 10) * 0.1"
   }
   ```

### Field Shapes

**Circle:**
```typescript
{ shape: "circle", bounds: { cx: 100, cy: 100, r: 50 } }
```

**Rectangle:**
```typescript
{ shape: "rect", bounds: { x: 50, y: 50, width: 100, height: 80 } }
```

**Polygon:**
```typescript
{ shape: "polygon", bounds: { points: [[x1,y1], [x2,y2], ...] } }
```

### Field Interactions

**When fields overlap:**

1. **Check affected pixels** - Which pixels are in both fields?
2. **Apply z-index** - Higher z-index takes priority (if not merging)
3. **Merge effects** - Based on `mergeMode`:

   **Add:** Forces combine
   ```typescript
   finalVx = field1.vx + field2.vx
   finalVy = field1.vy + field2.vy
   ```

   **Multiply:** Effects amplify
   ```typescript
   finalStrength = field1.strength * field2.strength
   ```

   **Max:** Strongest wins
   ```typescript
   finalEffect = Math.max(field1.effect, field2.effect)
   ```

   **Custom:** Execute interactionCode
   ```typescript
   eval(field1.interactionCode) // With safety sandbox
   ```

### Field Update Loop

**Each frame:**
```typescript
for (const pixel of pixels) {
  // Find all fields affecting this pixel
  const affectingFields = fields.filter(f =>
    pixelInBounds(pixel, f.bounds) &&
    f.affectsTags.some(tag => pixel.tags.includes(tag))
  )

  // Sort by z-index (highest first)
  affectingFields.sort((a, b) => b.zIndex - a.zIndex)

  // Apply field effects
  if (affectingFields.length === 1) {
    applyFieldEffect(pixel, affectingFields[0])
  } else if (affectingFields.length > 1) {
    // Handle merge
    const merged = mergeFieldEffects(affectingFields, pixel)
    applyMergedEffect(pixel, merged)
  }
}
```

---

## Space Architecture

### Space Bounds

Each space has fixed dimensions:
- **Default:** 800x600 pixels
- **Max:** 2000x2000 pixels (prevent abuse)
- **Scrollable:** If content exceeds bounds

### Space Layers

Rendering order (back to front):
1. **Background** - Static or animated backdrop
2. **Pixel fields** - Visual field indicators (optional)
3. **Pixels** - Grid-locked first, then free-floating (sorted by y)
4. **Objects** - Interactive tools, games, UI elements
5. **Influences** - AI agents (rendered as pixel creatures)
6. **Overlay** - UI, chat, controls

### Space Chat

**Settings:**
- `chatEnabled: boolean` - Owner can toggle
- Scoped to space ID
- Only visible when "inside" that space
- Standard chat UI (messages, typing indicators)

### Space Ownership

**Owner capabilities:**
- Create/modify pixels, fields, objects
- Enable/disable chat
- Invite/kick visitors
- Call Claude API
- Set space visibility (public/private)

**Visitor capabilities:**
- View all content
- Chat (if enabled)
- Limited interactions (owner-defined)
- Cannot modify structure

---

## Multiplayer System

### Real-Time Synchronization

**Technology:** WebSocket (via Socket.io or native WebSocket)

**Events:**

**Client → Server:**
- `player:move` - Send position/velocity update
- `player:enter_space` - Enter a ship interior
- `player:exit_space` - Return to outer world
- `pixel:spawn` - Create pixel (if permitted)
- `field:create` - Create field (if owner)

**Server → Client:**
- `world:state` - Full world state (on connect)
- `player:joined` - New player entered
- `player:left` - Player disconnected
- `player:moved` - Player position update
- `space:updated` - Space content changed
- `pixel:created` - New pixel spawned
- `field:created` - New field added

### Position Updates

**Client-side prediction:**
- Client updates own position immediately
- Server validates and corrects if needed
- Smooth interpolation for other players

**Update frequency:**
- 20Hz (50ms interval) for position
- Event-driven for space modifications

**Interpolation:**
```typescript
// Smooth movement of other players
function interpolate(player, dt) {
  const factor = dt / 50 // 50ms update interval
  player.renderX += (player.serverX - player.renderX) * factor
  player.renderY += (player.serverY - player.renderY) * factor
}
```

### World Partitioning

For scale (1000+ players):
- **Spatial partitioning** - Divide world into regions
- **View radius** - Only sync nearby players
- **Interest management** - Subscribe to relevant regions

---

## Docking Mechanics

### Docking Flow

**Initiate:**
1. Drag navigation orb onto target ship/chant
2. Check proximity (must be within 50px)
3. Send `dock:request` to server

**Server validation:**
1. Verify both ships exist
2. Check permissions (can you dock here?)
3. Calculate relative offset and rotation
4. Create `ShipDocking` record

**Visual result:**
- Ships rendered as connected structure
- Docked ships move together
- Can enter docked ship's interior

### Permanent Docking

**Properties:**
- Docking persists across sessions
- Docked ships form compound structure
- Structure moves as one unit
- Can create space stations, cities, clusters

**Undocking:**
- Owner can undock at any time
- Server removes `ShipDocking` record
- Ships become independent again

### Docking Constraints

**Limits:**
- Max 5 ships docked to one ship (prevent mega-structures)
- Max depth 3 (A docked to B docked to C = ok, D = no)
- Cycle prevention (A → B → A = not allowed)

---

## Claude API Integration

### API Endpoints

**Space modification:**
```typescript
POST /api/spaces/:id/claude
{
  prompt: "Create a whirlpool in the center",
  maxTokens: 1000
}
```

**Response:**
```typescript
{
  actions: [
    {
      type: "create_field",
      data: {
        name: "whirlpool",
        shape: "circle",
        bounds: { cx: 400, cy: 300, r: 100 },
        behavior: "vortex",
        params: { strength: 0.5, clockwise: true },
        affectsTags: ["particle"]
      }
    },
    {
      type: "spawn_pixels",
      data: {
        count: 50,
        bounds: { cx: 400, cy: 300, r: 100 },
        color: "#0088ff",
        tags: ["particle", "water"],
        vx: () => Math.random() * 2 - 1,
        vy: () => Math.random() * 2 - 1
      }
    }
  ]
}
```

### Claude Tool Schema

**Tools provided to Claude:**

1. **create_field** - Create a pixel field
2. **spawn_pixels** - Spawn pixel entities
3. **create_object** - Create interactive object
4. **spawn_influence** - Create AI influence
5. **modify_field** - Update field properties
6. **remove_field** - Delete field
7. **clear_pixels** - Remove pixels by tag/area

**Example tool use:**
```typescript
{
  name: "create_field",
  description: "Create a pixel field that affects tagged pixels",
  parameters: {
    name: "string",
    shape: "circle | rect | polygon",
    bounds: "object",
    behavior: "gravity | wind | magnet | color_shift | vortex | custom",
    params: "object",
    affectsTags: "string[]",
    zIndex: "number"
  }
}
```

### Safety & Validation

**Before executing Claude actions:**
1. **Quota check** - Max 100 objects/fields per space
2. **Bounds check** - Objects must fit in space bounds
3. **Code review** - Scan customCode for malicious patterns
4. **Rate limit** - Max 10 Claude API calls per minute per space

### Example Prompts → Actions

**User:** "Make it rain"
**Claude:**
```json
[
  {
    "type": "create_field",
    "data": {
      "name": "rain_zone",
      "shape": "rect",
      "bounds": { "x": 0, "y": 0, "width": 800, "height": 200 },
      "behavior": "gravity",
      "params": { "strength": 0.8 },
      "affectsTags": ["raindrop"]
    }
  },
  {
    "type": "spawn_pixels",
    "data": {
      "count": 100,
      "scatter": { "x": 0, "y": 0, "width": 800, "height": 50 },
      "color": "#88ccff",
      "tags": ["raindrop", "particle"],
      "lifespan": 200
    }
  }
]
```

**User:** "Create a voting booth"
**Claude:**
```json
[
  {
    "type": "create_object",
    "data": {
      "type": "game",
      "x": 350,
      "y": 250,
      "width": 100,
      "height": 150,
      "pixelData": {
        /* Pixel art booth */
      },
      "behavior": {
        "interactive": true,
        "onClick": "openVoteUI()"
      }
    }
  }
]
```

---

## Rendering Pipeline

### Frame Loop

```typescript
function renderFrame(dt) {
  // 1. Update physics
  updatePixelVelocities(pixels, fields, dt)
  updateInfluences(influences, dt)

  // 2. Handle collisions (optional)
  if (collisionsEnabled) {
    resolveCollisions(pixels)
  }

  // 3. Clear canvas
  ctx.fillStyle = '#0a0a0f'
  ctx.fillRect(0, 0, width, height)

  // 4. Render layers
  renderBackground()
  renderFields(fields) // Optional field visualization
  renderPixels(pixels)
  renderObjects(objects)
  renderInfluences(influences)
  renderOverlay()

  // 5. Cleanup
  removeExpiredPixels()

  // 6. Next frame
  requestAnimationFrame(renderFrame)
}
```

### Pixel Rendering

**Free-floating pixels:**
```typescript
for (const pixel of pixels) {
  ctx.fillStyle = pixel.color
  ctx.fillRect(
    Math.floor(pixel.x),
    Math.floor(pixel.y),
    1, // 1px width
    1  // 1px height
  )
}
```

**Pixel art objects:**
```typescript
for (const obj of objects) {
  for (const [x, y, color] of obj.pixelData) {
    ctx.fillStyle = color
    ctx.fillRect(obj.x + x, obj.y + y, 1, 1)
  }
}
```

### Field Visualization (Debug Mode)

```typescript
function renderField(field) {
  ctx.strokeStyle = field.color + '44' // Semi-transparent
  ctx.lineWidth = 2

  if (field.shape === 'circle') {
    ctx.beginPath()
    ctx.arc(field.bounds.cx, field.bounds.cy, field.bounds.r, 0, Math.PI * 2)
    ctx.stroke()
  } else if (field.shape === 'rect') {
    ctx.strokeRect(field.bounds.x, field.bounds.y, field.bounds.width, field.bounds.height)
  }
}
```

---

## Interaction Flows

### 1. Enter Your Ship Interior

**User action:** Drag orb onto own ship

**Flow:**
1. Client: Drop orb on ship at (x, y)
2. Client: Detect it's own ship
3. Client: Send `space:enter` event
4. Server: Create Space if doesn't exist
5. Server: Return space data (pixels, fields, objects)
6. Client: Transition to interior view
7. Client: Render space canvas

**Visual transition:**
- Fade to black
- Zoom effect (ship grows to fill screen)
- Interior canvas fades in

### 2. Dock with Another Ship

**User action:** Drag orb onto another ship

**Flow:**
1. Client: Drop orb on ship at (x, y)
2. Client: Check proximity (within 50px?)
3. Client: Send `dock:request { targetShipId }`
4. Server: Validate (exists? permission? not already docked?)
5. Server: Calculate offset/rotation
6. Server: Create ShipDocking record
7. Server: Broadcast `dock:success` to both players
8. Client: Update rendering (ships now connected)

**Visual:**
- Magnetic snap animation
- Connection line appears
- Both ships pulse briefly

### 3. Dock with Chant

**User action:** Drag orb onto chant energy orb

**Flow:**
1. Client: Drop orb on chant at (x, y)
2. Client: Identify chant ID
3. Client: Navigate to `/chants/:id` (dedicated view)
4. Server: Return full chant data
5. Client: Render immersive chant UI

**Visual:**
- Ship flies toward chant
- Fade transition
- Dedicated view appears

### 4. Claude API Modification

**User action:** Type command in space chat: "/claude make stars twinkle"

**Flow:**
1. Client: Send message to space chat
2. Server: Detect `/claude` prefix
3. Server: Extract prompt: "make stars twinkle"
4. Server: Call Claude API with tools
5. Claude: Returns actions (create_field, spawn_pixels)
6. Server: Validate actions (quota, bounds)
7. Server: Execute actions (create records)
8. Server: Broadcast updates to all viewers
9. Client: Render new pixels/fields

**Visual:**
- "Claude is working..." indicator
- Pixels spawn with fade-in animation
- Field appears with pulse

### 5. Influence Collaboration

**User action:** Drop two influences in same space

**Flow:**
1. Server: Detect multiple influences in space
2. Server: Check `collaborateWith` settings
3. Server: If compatible, enable communication
4. Each influence gets Claude API access
5. Influences exchange messages via server
6. Each generates pixel/field modifications
7. Server merges actions, executes
8. Visual result: Emergent behavior

**Example:**
- Influence A: "I'm creating a garden"
- Influence B: "I'll add butterflies"
- Result: Garden pixels + butterfly particle field

---

## Security & Quotas

### Per-Space Limits

- **Max pixels:** 10,000
- **Max fields:** 50
- **Max objects:** 100
- **Max influences:** 10
- **Total storage:** 10MB

### API Rate Limits

- **Claude API:** 10 calls/minute per space
- **Space modifications:** 100/hour per user
- **Pixel spawns:** 1,000/minute per space

### Code Sandboxing

**Custom code execution:**
- Run in isolated VM (e.g., vm2, QuickJS)
- No access to: network, filesystem, parent scope
- Timeout: 100ms per execution
- Memory limit: 10MB

**Allowed globals:**
```typescript
{
  Math,
  pixel,  // Current pixel being affected
  field,  // Current field
  time,   // Current timestamp
  random: Math.random
}
```

### Malicious Code Detection

**Scan for:**
- `eval`, `Function`, `require`, `import`
- Infinite loops (static analysis)
- Excessive memory allocation
- Network requests

**If detected:** Reject modification, log attempt, notify owner

---

## Example Use Cases

### 1. Physics Playground

**User:** "Create a gravity well in the center"

**Claude creates:**
- Circular magnet field (center, r=100, attraction)
- 500 particle pixels around edges
- Result: Particles spiral inward

**User:** "Add a wind current from left"

**Claude creates:**
- Rectangular wind field (left edge, rightward force)
- Overlaps with gravity well
- Result: Particles orbit in diagonal spiral

### 2. Collaborative Art Canvas

**User:** "Let anyone paint here"

**Claude creates:**
- Click-to-paint handler
- Pixel persistence
- Color picker UI
- Result: Shared drawing surface

**Multiple users:**
- Each adds pixels
- Creates emergent art
- Can be saved as snapshot

### 3. Mini-Game: Avoid the Red

**User:** "Create a game where you dodge red squares"

**Claude creates:**
- Player object (green square, arrow key controls)
- Spawner field (creates red squares at top)
- Gravity field (pulls red squares down)
- Collision detection
- Score counter
- Result: Playable dodge game

### 4. AI Influence Swarm

**User:** Drops 5 influences with task: "Paint a forest"

**Influences coordinate:**
- Influence 1: Creates ground (brown pixels)
- Influence 2: Adds trees (green + brown)
- Influence 3: Sky gradient (blue pixels)
- Influence 4: Sun (yellow glow field)
- Influence 5: Clouds (white particles with drift)
- Result: Collaborative pixel art scene

### 5. Data Visualization

**User:** "Show chant voting results as a graph"

**Claude creates:**
- Fetch voting data via API
- Generate bar chart pixels
- Color code by tier
- Add labels (text as pixel art)
- Result: Live updating data viz

---

## Open Questions

1. **Multiplayer scale** - How many concurrent players per world region?
2. **Pixel persistence** - Store in DB or canvas snapshots?
3. **Influence autonomy** - How much can they do without permission?
4. **Docking physics** - Should docked structures have mass/inertia?
5. **Cross-space interactions** - Can fields affect pixels in docked ships?
6. **Economy** - Cost for Claude API calls? Space upgrades?
7. **Moderation** - How to handle inappropriate pixel art?

---

## Next Steps

1. **Review & refine** this spec with team
2. **Create wireframes** for key screens
3. **Build prototype** - Single-player World with basic pixels/fields
4. **Test Claude integration** - Verify action generation works
5. **Add multiplayer** - WebSocket sync
6. **Polish & iterate** - Make it alive

---

**End of Specification**
