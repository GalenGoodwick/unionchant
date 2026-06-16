const http = require('http')
const { Server } = require('socket.io')

const PORT = process.env.PORT || 8080

const ALLOWED_ORIGINS = [
  'https://unionchant.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
]

// ── HTTP server for health checks ──

const httpServer = http.createServer((req, res) => {
  // CORS for HTTP endpoints
  const origin = req.headers.origin
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  if (req.url === '/health') {
    const instanceCounts = {}
    for (const [instanceId, room] of rooms.entries()) {
      instanceCounts[instanceId] = room.size
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      totalPlayers: sockets.size,
      instances: instanceCounts,
      timestamp: Date.now(),
    }))
  } else if (req.url === '/instances') {
    // Returns all active instances with player details (for feed presence dots)
    const result = {}
    for (const [instanceId, room] of rooms.entries()) {
      result[instanceId] = Array.from(room.values()).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
      }))
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

// ── Socket.IO server ──

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
})

// ── State ──

// rooms: instanceId -> Map<socketId, player>
const rooms = new Map()

// sockets: socketId -> { userId, name, color, currentInstance }
const sockets = new Map()

function getRoom(instanceId) {
  if (!rooms.has(instanceId)) {
    rooms.set(instanceId, new Map())
  }
  return rooms.get(instanceId)
}

function cleanupEmptyRooms() {
  for (const [id, room] of rooms.entries()) {
    if (room.size === 0) rooms.delete(id)
  }
}

// ── Connection handling ──

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`)

  // Client sends auth with identity
  socket.on('auth', ({ userId, name, color }) => {
    const playerInfo = {
      userId,
      name,
      color,
      currentInstance: null,
    }
    sockets.set(socket.id, playerInfo)
    console.log(`Authenticated: ${userId} (${name})`)
  })

  // Client joins an instance (room)
  socket.on('join-instance', ({ instance }) => {
    const playerInfo = sockets.get(socket.id)
    if (!playerInfo) return

    const previousInstance = playerInfo.currentInstance

    // Leave previous room
    if (previousInstance) {
      const prevRoom = rooms.get(previousInstance)
      if (prevRoom) {
        prevRoom.delete(socket.id)
        if (prevRoom.size === 0) rooms.delete(previousInstance)
        // Notify others in the old room
        socket.to(previousInstance).emit('player-left', {
          playerId: playerInfo.userId,
          instance: previousInstance,
        })
      }
      socket.leave(previousInstance)
    }

    // Join new room
    playerInfo.currentInstance = instance
    const newRoom = getRoom(instance)
    const player = {
      id: playerInfo.userId,
      name: playerInfo.name,
      color: playerInfo.color,
      rx: playerInfo.rx || 0.5,
      ry: playerInfo.ry || 0.5,
    }
    newRoom.set(socket.id, player)
    socket.join(instance)

    // Send full room state to the joining client
    const players = Array.from(newRoom.values())
    socket.emit('instance-state', { instance, players })

    // Notify others in the new room
    socket.to(instance).emit('player-joined', { player, instance })

    // Broadcast transition to ALL connected clients (for animation)
    if (previousInstance) {
      io.emit('player-transition', {
        playerId: playerInfo.userId,
        playerColor: playerInfo.color,
        playerName: playerInfo.name,
        from: previousInstance,
        to: instance,
      })
    }

    console.log(`${playerInfo.name}: ${previousInstance || '(none)'} -> ${instance} (${newRoom.size} in room)`)
  })

  // Position update — player tapped/dragged to new location
  socket.on('position', ({ rx, ry }) => {
    const playerInfo = sockets.get(socket.id)
    if (!playerInfo || !playerInfo.currentInstance) return
    playerInfo.rx = rx
    playerInfo.ry = ry
    const room = rooms.get(playerInfo.currentInstance)
    if (room) {
      const player = room.get(socket.id)
      if (player) {
        player.rx = rx
        player.ry = ry
      }
    }
    socket.to(playerInfo.currentInstance).emit('player-moved', {
      playerId: playerInfo.userId,
      instance: playerInfo.currentInstance,
      rx,
      ry,
    })
  })

  // Disconnect cleanup
  socket.on('disconnect', () => {
    const playerInfo = sockets.get(socket.id)
    if (playerInfo && playerInfo.currentInstance) {
      const room = rooms.get(playerInfo.currentInstance)
      if (room) {
        room.delete(socket.id)
        socket.to(playerInfo.currentInstance).emit('player-left', {
          playerId: playerInfo.userId,
          instance: playerInfo.currentInstance,
        })
        if (room.size === 0) rooms.delete(playerInfo.currentInstance)
      }
    }
    sockets.delete(socket.id)
    if (playerInfo) {
      console.log(`Disconnected: ${playerInfo.name}`)
    }
  })
})

// Cleanup empty rooms periodically
setInterval(cleanupEmptyRooms, 30000)

httpServer.listen(PORT, () => {
  console.log(`Presence server running on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})
