const WebSocket = require('ws')
const http = require('http')

const PORT = process.env.PORT || 8080
const SPATIAL_RANGE = 2000 // Only broadcast to players within 2000 units

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      players: players.size,
      timestamp: Date.now()
    }))
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

// WebSocket server
const wss = new WebSocket.Server({ server })

// Player store: userId -> { ws, x, y, angle, userName, deliberationId, lastUpdate }
const players = new Map()

// Broadcast interval (30fps = ~33ms)
const BROADCAST_INTERVAL = 100 // 10fps for now (can increase to 33ms for 30fps)

// Calculate distance between two points
function distance(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

// Get nearby players (spatial culling)
function getNearbyPlayers(x, y, excludeUserId) {
  const nearby = []

  for (const [userId, player] of players.entries()) {
    if (userId === excludeUserId) continue

    const dist = distance(x, y, player.x, player.y)
    if (dist <= SPATIAL_RANGE) {
      nearby.push({
        userId,
        userName: player.userName,
        x: player.x,
        y: player.y,
        angle: player.angle
      })
    }
  }

  return nearby
}

// Broadcast player positions
function broadcastPositions() {
  for (const [userId, player] of players.entries()) {
    if (player.ws.readyState !== WebSocket.OPEN) continue

    const nearbyPlayers = getNearbyPlayers(player.x, player.y, userId)

    // Only send if there are nearby players
    if (nearbyPlayers.length > 0) {
      player.ws.send(JSON.stringify({
        type: 'players',
        players: nearbyPlayers
      }))
    }
  }
}

// Start broadcast loop
setInterval(broadcastPositions, BROADCAST_INTERVAL)

wss.on('connection', (ws) => {
  let currentUserId = null

  console.log('Client connected')

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())

      if (msg.type === 'position') {
        const { userId, userName, x, y, angle, deliberationId } = msg

        currentUserId = userId

        // Update player position
        players.set(userId, {
          ws,
          x,
          y,
          angle,
          userName,
          deliberationId,
          lastUpdate: Date.now()
        })
      }
    } catch (err) {
      console.error('Message parse error:', err)
    }
  })

  ws.on('close', () => {
    if (currentUserId) {
      players.delete(currentUserId)
      console.log(`Player ${currentUserId} disconnected. Active players: ${players.size}`)
    }
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
  })
})

// Cleanup stale players (haven't updated in 30 seconds)
setInterval(() => {
  const now = Date.now()
  const STALE_THRESHOLD = 30000 // 30 seconds

  for (const [userId, player] of players.entries()) {
    if (now - player.lastUpdate > STALE_THRESHOLD) {
      players.delete(userId)
      console.log(`Removed stale player ${userId}`)
    }
  }
}, 10000) // Check every 10 seconds

server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})
