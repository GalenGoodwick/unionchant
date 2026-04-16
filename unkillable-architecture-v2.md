# Unkillable Architecture — Unity Chant v2

## Context

UC currently runs on a single stack: Vercel (hosting) + Neon (database) + Google/GitHub (auth) + single domain. Any of these can be shut down by one entity making one decision. The goal is an architecture where NO single point of failure can kill the system. Complete fallback from all manners of shutdown:

- Vercel goes down → federated instances pick up
- Domain seized → alternative domains, IPFS, direct IP, .onion
- App stores ban → PWA sideloading, NFC spread
- Internet goes down → Bluetooth mesh, NFC data transfer, local computation
- Database deleted → every device holds the data (local-first)
- Legal pressure → open source, no single operator, community governance
- Auth providers revoke → local credentials, passkeys, device identity

**Constraint:** Build incrementally. Each layer works standalone AND improves with the next. Start shipping value in Phase 1.

---

## Current State (what exists)

| Component | Status |
|-----------|--------|
| PWA manifest + sw.js | Configured, installable, push notifications |
| Offline capability | NONE — sw.js has no fetch handler, no caching |
| Data storage | Server only (Neon Postgres via Prisma) |
| Client state | React Context + hooks. No IndexedDB, no localStorage (except theme) |
| Sharing | ShareMenu.tsx with social intent URLs. No navigator.share(), no QR, no NFC |
| P2P / sync | Nothing. socket.io installed but unused |
| Auth | NextAuth (Google, GitHub, email/password) |
| Invite system | `/invite/[code]` with OG images |

**Key files:**
- `web/src/lib/voting.ts` — 1675 lines, core tournament engine
- `web/src/lib/challenge.ts` — 273 lines, challenge rounds
- `web/prisma/schema.prisma` — full data model
- `web/public/sw.js` — bare service worker
- `web/src/components/ShareMenu.tsx` — social share dropdown
- `web/src/app/invite/[code]/InvitePageClient.tsx` — invite flow

---

## Architecture: 6 Layers

Each layer is independent and useful on its own. Later layers compound earlier ones.

### Layer 1: Viral Physical Spread
**Goal:** One person starts a chant, spreads it by tapping phones. 50 people in 5 minutes.

### Layer 2: Offline-First Local Storage
**Goal:** App works without internet. Vote, comment, create chants offline.

### Layer 3: Device-to-Device Sync
**Goal:** Devices sync data directly. No server needed for local group consensus.

### Layer 4: Federation
**Goal:** Anyone can host a UC instance. Instances discover and sync with each other.

### Layer 5: Anti-Censorship Distribution
**Goal:** App can't be removed from devices. Multiple distribution channels.

### Layer 6: Mesh Networking
**Goal:** UC works when the internet is completely down. Bluetooth/WiFi Direct mesh.

---

## Phase 1: Viral Physical Spread + Offline PWA Foundation

**Ship first. Two parallel workstreams.**

### 1A: SpreadPanel (NFC + QR + Share)

**Install:**
```bash
npm install qrcode @types/qrcode
```

**New files (4):**

**`src/hooks/useQRCode.ts`**
- Takes URL string, returns canvas data URL
- Dark background, light dots (matches theme)
- Exports: `{ dataUrl, canvasRef, download(), print() }`

**`src/hooks/useNFC.ts`**
- Feature-detects `NDEFReader` (Android Chrome only)
- `writeTag(url)` → writes NDEF URL record to NFC tag
- `writeData(payload)` → writes NDEF binary record (chant data for offline)
- States: idle | scanning | success | error
- Hidden on unsupported browsers (no errors)

**`src/hooks/useInstallPrompt.ts`**
- Captures `beforeinstallprompt` event
- Exports: `{ canInstall, promptInstall() }`
- Shows contextually after joining via invite

**`src/components/SpreadPanel.tsx`**
- Props: `url`, `title`, `description`, `chantData?` (for offline NFC), `variant: 'inline' | 'modal'`
- Layout:
  1. QR code canvas + Download/Print buttons
  2. Share button → `navigator.share()` on mobile, social intents on desktop
  3. NFC button (Android only) — "Tap to Spread" with pulse animation
  4. Copy link input + button
  5. Social icons row (X, WhatsApp, Email, SMS)

**Modified files (3):**

**`src/components/ShareMenu.tsx`**
- Add `navigator.share()` as primary action
- Falls through to existing dropdown if unavailable/cancelled

**`src/app/chants/[id]/ChantSimulator.tsx`**
- Replace invite link in Manage tab with `<SpreadPanel variant="inline" />`
- Add "Spread" button in header that opens SpreadPanel as modal

**`src/app/invite/[code]/InvitePageClient.tsx`**
- After successful join: show "You're in! Spread it." interstitial
- SpreadPanel + PWA install prompt + "Go to chant" button

### 1B: Offline-First Foundation

**Install:**
```bash
npm install idb
```
(`idb` is a tiny IndexedDB wrapper, ~1.2KB)

**New files (3):**

**`src/lib/offline/db.ts`** — IndexedDB schema
```typescript
// Database: 'unity-chant-local'
// Stores:
//   chants      — { id, question, description, phase, createdAt, syncedAt }
//   ideas       — { id, chantId, text, authorId, status, syncedAt }
//   votes       — { id, cellId, ideaId, oderId, synced: boolean }
//   comments    — { id, cellId, text, ideaId, userId, synced: boolean }
//   cells       — { id, chantId, tier, status, ideas[], participants[] }
//   outbox      — { id, type, payload, createdAt, retries }
//   identity    — { id, publicKey, privateKey, displayName }
```

**`src/lib/offline/sync.ts`** — Sync engine
- `pushOutbox()` — sends queued writes to server when online
- `pullChant(id)` — fetches latest state from server, merges into IndexedDB
- `fullSync()` — push outbox + pull all subscribed chants
- Background sync registration via service worker
- Conflict resolution: server wins for tournament state, append-only for comments/votes

**`src/lib/offline/hooks.ts`** — React hooks for offline data
- `useOfflineChant(id)` — reads from IndexedDB, falls back to API, caches result
- `useOfflineVote(cellId)` — queues vote locally, syncs when online
- `useOfflineComment(cellId)` — queues comment locally, syncs when online
- `useOnlineStatus()` — tracks navigator.onLine + actual connectivity

**Modified files (1):**

**`public/sw.js`** — Upgrade to real offline service worker
- App shell caching: cache HTML, JS, CSS on install
- API response caching: cache GET responses with stale-while-revalidate
- Background sync: `sync` event handler processes outbox
- Offline fallback page when completely disconnected
- Cache versioning for updates

### Progressive Enhancement Matrix (Phase 1)

| Feature | Works on | Fallback |
|---------|----------|----------|
| QR code | All browsers | Always works |
| Web Share API | Mobile Safari 15+, Chrome 89+ | Social intent dropdown |
| NFC tag write | Android Chrome 89+ | Button hidden |
| NFC tag read | iOS 13+, all Android | Native OS handles NDEF URLs |
| NFC data payload | Android Chrome | Falls back to URL-only |
| PWA install | Chrome, Edge, Samsung | Hidden on iOS |
| Copy link | All | Always works |
| IndexedDB cache | All modern browsers | API-only (current behavior) |
| Background sync | Chrome, Edge | Manual sync on reconnect |
| Offline voting | All (queued) | Submits when online |

---

## Phase 2: Device-to-Device Sync

**Goal:** Two phones in the same room can sync a chant without internet.

### 2A: Sync Protocol

**The tournament is the sync primitive.** A cell of 5 ideas with 5 votes is a self-contained computation. Two devices that have the same cell data can independently compute the same winner. This means:

- Votes are the atomic unit of sync (small, append-only, idempotent)
- Cell results are deterministic given the same votes
- Tier progression is deterministic given cell results
- The entire tournament can be replayed from votes alone

**Data model for sync:**
```typescript
type SyncMessage = {
  type: 'chant' | 'idea' | 'vote' | 'comment' | 'cell' | 'result'
  id: string           // globally unique (UUID)
  chantId: string
  payload: unknown
  timestamp: number
  authorDeviceId: string
  signature: string    // Ed25519 sign(payload, devicePrivateKey)
}
```

**Conflict resolution:**
- Votes: append-only, deduplicated by `(userId, cellId)`. Last-write-wins if duplicate.
- Ideas: append-only. Duplicates detected by text similarity.
- Comments: append-only. No conflicts possible.
- Cell assignments: creator-authoritative (whoever created the chant assigns cells)
- Tournament results: deterministic from votes — every device computes identically.

### 2B: Transport Layers (Phase 2 uses WebRTC)

**`src/lib/p2p/webrtc.ts`** — WebRTC data channel
- Signaling: use existing server as signaling relay (ICE candidates via API)
- Fallback signaling: manual exchange (copy-paste SDP offer/answer — ugly but works offline)
- QR code signaling: scan QR to exchange connection info
- Data channel: reliable, ordered, for SyncMessages

**`src/lib/p2p/peer-manager.ts`** — Peer discovery and connection
- Track connected peers
- Gossip protocol: each peer forwards SyncMessages to all connected peers
- Deduplication: seen message IDs (bloom filter)
- Peer limit: max 20 concurrent connections

**How it works in practice:**
1. Alice creates a chant, device generates it locally
2. Alice taps Bob's phone (NFC) → Bob gets chant data + Alice's peer ID
3. Bob's device connects to Alice via WebRTC
4. Both submit ideas locally, sync via data channel
5. Cell assignment happens on Alice's device (she's the creator), synced to Bob
6. Both vote locally, votes sync immediately
7. Both devices compute the same cell result independently
8. If more people join (via NFC/QR from Alice or Bob), they mesh-connect

### 2C: Local Tournament Engine

**`src/lib/offline/tournament.ts`** — Client-side voting engine
- Port the essential logic from `voting.ts`:
  - `createCells(ideas[], participants[])` — cell assignment with conflict avoidance
  - `tallyVotes(cell)` — vote counting (XP sum)
  - `advanceTier(results[])` — tier progression
  - `detectFinalShowdown(ideas[])` — ≤5 remaining
- Runs entirely in the browser. No server needed.
- Deterministic: same inputs → same outputs on every device.
- ~200 lines (the core algorithm is simple; the server version is complex because of DB operations)

---

## Phase 3: Federation

**Goal:** Anyone can run a UC instance. Instances connect to each other.

### 3A: Instance Identity

Each UC instance has:
- A keypair (Ed25519) generated on first run
- A human-readable instance name
- A list of known peer instances
- An ActivityPub-compatible actor for discovery

**`src/lib/federation/instance.ts`**
- Instance registration: announce existence to known peers
- Instance discovery: query peers for their known peers (gossip)
- Instance verification: challenge-response with keypair

### 3B: Cross-Instance Protocol

**Federation follows the tournament structure:**
- Tier 1-3: local to instance (fast, low latency)
- Tier 4+: cross-instance (ideas that survive local tiers compete globally)
- Final showdown: all instances contribute votes

**Sync between instances:**
- Lightweight: only advancing ideas + votes cross instance boundaries
- Each instance runs its own tournament up to a configurable tier
- Winners at that tier are published to the federation
- Federation-level tiers combine winners from all instances
- Final result is computed by any instance with complete data (deterministic)

### 3C: Hosting Options

| Method | Difficulty | Cost | Resilience |
|--------|-----------|------|------------|
| Vercel (current) | Easy | Free tier | Single point of failure |
| Docker self-host | Medium | $5/mo VPS | Distributed |
| Cloudflare Workers + D1 | Medium | Free tier | Edge-distributed |
| Static export + Supabase | Easy | Free tier | Stateless app |
| IPFS + Pinata | Hard | Free tier | Content-addressed, censorship-resistant |
| Tor hidden service | Hard | Free (own hardware) | Anonymous, uncensorable |

**Docker image:**
```dockerfile
# uc-node: runs UC instance with embedded SQLite
# No external database needed
# Port 3000: web UI
# Port 3001: federation API
# Port 3002: P2P signaling
```

### 3D: Data Sovereignty

- Each instance owns its data
- Users can export all their data (ideas, votes, comments) as signed JSON
- Users can migrate between instances with their identity
- No instance can be compelled to delete data it doesn't host
- The federation has no admin — it's instances all the way down

---

## Phase 4: Anti-Censorship Distribution

**Goal:** UC can't be removed from devices. Multiple distribution paths.

### 4A: Multi-Channel Distribution

| Channel | Survives | Setup |
|---------|----------|-------|
| Vercel (unionchant.vercel.app) | Normal operation | Current |
| Custom domain (unitychant.org) | Domain seizure of .vercel.app | Buy domain, point DNS |
| Alternative domains (.xyz, .io, .onion) | Domain seizure of primary | Multiple registrars, different TLDs |
| IPFS (ipfs://Qm...) | All domain seizure | Pin to Pinata/Fleek, content-addressed |
| GitHub Pages fallback | Vercel shutdown | Static export, auto-deploy from repo |
| Direct IP access | All DNS shutdown | Hardcode IP in PWA, peers share IPs |
| NFC data transfer | Internet shutdown | Chant data on NFC tags, fully offline |
| Bluetooth mesh (Phase 6) | Complete internet shutdown | Device-to-device, no infrastructure |

### 4B: PWA Resilience

- **Cache everything:** Full app shell + all JS bundles cached in service worker
- **Update silently:** Check for updates in background, apply on next open
- **Survive app store removal:** PWA can't be removed by Apple/Google (lives in browser)
- **Sideload on Android:** APK wrapper via TWA (Trusted Web Activity) for Play Store ban scenario
- **iOS resilience:** PWA persists as long as Safari cache isn't cleared (no sideloading possible on iOS)

### 4C: Open Source Everything

- Repository: MIT license (already done)
- Build instructions in README
- One-click deploy buttons (Vercel, Railway, Render, Fly.io)
- Docker image on Docker Hub + GitHub Container Registry
- No secrets required for basic operation (SQLite, local auth)

### 4D: Identity Without Auth Providers

**Passkeys (WebAuthn)** — device-native authentication
- No Google, no GitHub, no email provider needed
- Private key lives on device, never leaves
- Works across all modern browsers and phones
- Backup: recovery phrase (12 words) generates deterministic keypair

**Device identity:**
- First launch: generate Ed25519 keypair
- Public key = user ID (no server registration needed)
- Display name stored locally
- Portable: export keypair to new device via QR/NFC

---

## Phase 5: Mesh Networking (Internet Down)

**Goal:** UC works when there's no internet at all.

### 5A: Bluetooth Low Energy Mesh

**Only possible with a native app wrapper** (Web Bluetooth API can't do background scanning or mesh).

**React Native wrapper** or **Capacitor plugin:**
- BLE advertising: broadcast "I have UC data" beacon
- BLE scanning: discover nearby UC devices
- BLE data transfer: exchange SyncMessages over GATT characteristics
- Mesh routing: multi-hop relay (A→B→C if A can't reach C)

### 5B: WiFi Direct (Android)

- Create ad-hoc WiFi network between devices
- Higher bandwidth than BLE (~250 Mbps vs ~1 Mbps)
- Range: ~200m vs ~100m for BLE
- Android only (iOS doesn't expose WiFi Direct)

### 5C: Mesh Topology = Tournament Topology

**The cell structure IS the mesh structure.**
- 5 devices form a cell (BLE mesh group)
- Cell members sync all data bidirectionally
- Cell winner device relays result to next-tier cell
- Tournament progression = data propagation through the mesh
- No central coordinator needed — the algorithm is the network

### 5D: Offline-First Complete Flow

1. Person A starts chant (generates locally, no internet)
2. A taps B's phone (NFC) → B gets chant data + A's peer info
3. B taps C, C taps D, D taps E → 5 people have the chant
4. Devices auto-discover via BLE → form mesh
5. All 5 submit ideas locally → sync via mesh
6. A's device (creator) assigns cells → syncs assignment
7. Everyone votes locally → votes sync via mesh
8. Every device computes the same winner (deterministic)
9. When someone gets internet → outbox syncs to server → rest of world sees result

**Total infrastructure needed: 0.** Five phones, no tower, no server, no domain.

---

## Phase 6: Cryptographic Guarantees

### 6A: Signed Everything

Every action (idea submission, vote, comment) is signed with the author's Ed25519 key.
- Prevents impersonation
- Enables verification without trusting any server
- Creates audit trail

### 6B: Vote Privacy

- Votes are encrypted with cell-level key (only cell members can see individual votes)
- Only the tally is public (5→1 reduction is the privacy boundary)
- Zero-knowledge proofs for vote validity (future — proves you voted for a valid idea without revealing which)

### 6C: Tamper-Evident Logs

- Each chant maintains a hash chain of all events
- Any device can verify the chain hasn't been tampered with
- Fork detection: if two devices have divergent chains, the conflict is visible

---

## Implementation Order

### Sprint 1 (Now): Viral Spread
**Files: 7 new, 3 modified**
1. `npm install qrcode @types/qrcode`
2. Create `useQRCode.ts`, `useNFC.ts`, `useInstallPrompt.ts`
3. Create `SpreadPanel.tsx`
4. Modify `ShareMenu.tsx` — add navigator.share()
5. Modify `ChantSimulator.tsx` — SpreadPanel in manage tab + header button
6. Modify `InvitePageClient.tsx` — post-join spread interstitial

### Sprint 2: Offline Foundation
**Files: 4 new, 1 modified**
1. `npm install idb`
2. Create `src/lib/offline/db.ts` — IndexedDB schema
3. Create `src/lib/offline/sync.ts` — outbox + pull sync
4. Create `src/lib/offline/hooks.ts` — React hooks for offline data
5. Upgrade `public/sw.js` — app shell caching, background sync, offline fallback

### Sprint 3: Local Tournament
**Files: 1 new**
1. Create `src/lib/offline/tournament.ts` — client-side voting engine
2. Wire up: offline vote → local tournament computation → result displayed immediately → syncs when online

### Sprint 4: P2P Sync
**Files: 2 new**
1. Create `src/lib/p2p/webrtc.ts` — WebRTC data channels
2. Create `src/lib/p2p/peer-manager.ts` — peer discovery + gossip

### Sprint 5: Device Identity
**Files: 2 new, 1 modified**
1. Create `src/lib/identity/keypair.ts` — Ed25519 key generation + storage
2. Create `src/lib/identity/passkey.ts` — WebAuthn registration/authentication
3. Modify auth flow — add passkey as auth option alongside Google/GitHub

### Sprint 6: Federation
**Files: 3 new**
1. Create `src/lib/federation/instance.ts` — instance identity + registration
2. Create `src/lib/federation/sync.ts` — cross-instance tournament sync
3. Create `Dockerfile` — self-hostable UC node with embedded SQLite

### Sprint 7: Mesh (Requires Native)
1. React Native or Capacitor wrapper
2. BLE mesh plugin
3. WiFi Direct plugin (Android)

---

## Verification

### Sprint 1
1. Open chant → Manage tab → SpreadPanel renders with QR
2. Scan QR → opens invite page
3. Mobile: native share sheet opens
4. Android Chrome: NFC write button visible, writes to tag
5. iOS: NFC button hidden, no errors
6. Join via invite → spread interstitial → PWA install prompt

### Sprint 2
1. Load a chant online → go offline → reload → chant data still visible
2. Submit comment offline → "queued" indicator shows
3. Go back online → comment syncs automatically
4. Service worker caches app shell → airplane mode → app still loads

### Sprint 3
1. Create chant offline → submit ideas offline → vote offline
2. Cell result computed locally and displayed
3. Go online → entire tournament syncs to server
4. Other devices see the same result

### Sprint 4
1. Two phones on same WiFi, both have UC installed
2. Phone A creates chant → taps Phone B (NFC)
3. Phone B gets chant data → WebRTC connects to A
4. Both submit ideas → ideas appear on both devices
5. Both vote → result appears on both devices simultaneously

### Sprint 5
1. Create account with passkey (no Google/GitHub)
2. Sign in on another device with same passkey
3. Export identity as QR → scan on new device → identity restored

### Sprint 6
1. Deploy UC instance on VPS via Docker
2. Instance discovers main instance
3. Create chant on VPS instance → ideas advance to federation tier
4. Main instance sees federated ideas in combined tournament

---

## What Dies When

| Failure | What still works |
|---------|-----------------|
| Vercel down | Federated instances, cached PWA, offline mode, P2P |
| Domain seized | Alternative domains, IPFS, direct IP, cached PWA |
| Database deleted | Local IndexedDB on every device, P2P sync rebuilds |
| Google/GitHub revoke OAuth | Passkeys, device identity, local auth |
| App store removal | PWA (can't be removed), sideload APK, web access |
| Internet down in area | BLE mesh, WiFi Direct, NFC data transfer |
| All internet down | NFC tags carry chant data, devices compute locally |
| Source code deleted | Every fork, every Docker image, every device cache |
| Legal shutdown order | No single entity to serve. Federated. Open source. Mesh. |

**The only way to kill it: destroy every phone that has it installed.**
And even then — the algorithm is public. Anyone can rewrite it.
