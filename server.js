// Import dependencies
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

// HTTP server (health checks + WebSocket upgrade)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebRTC Video Call Signaling Server');
});

// Attach WebSocket server
const wss = new WebSocket.Server({ server });

// Track clients and rooms
const clients = new Map(); // clientId -> ws
const rooms = new Map();   // roomId -> Set of clientIds

// Broadcast helper
function broadcast(roomId, senderId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const id of room) {
    if (id !== senderId) {
      const client = clients.get(id);
      if (client && client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (err) {
          console.error(`Failed to send to ${id}:`, err);
        }
      }
    }
  }
}

// Handle new connections
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  console.log(`Client connected: ${clientId}`);

  // Heartbeat for detecting dead connections
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.warn(`Invalid JSON from ${clientId}`);
      return;
    }

    const { type, roomId, payload } = data;
    if (!type || !roomId) return;

    switch (type) {
      case 'join':
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(clientId);
        console.log(`${clientId} joined room ${roomId}`);
        broadcast(roomId, clientId, { type: 'user-joined', from: clientId });
        break;

      case 'offer':
      case 'answer':
      case 'candidate':
        broadcast(roomId, clientId, { type, from: clientId, payload });
        break;

      default:
        console.log(`Unknown message type from ${clientId}: ${type}`);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    for (const [roomId, members] of rooms.entries()) {
      if (members.delete(clientId)) {
        broadcast(roomId, clientId, { type: 'user-left', from: clientId });
        if (members.size === 0) rooms.delete(roomId);
      }
    }
    console.log(`Client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => console.error(`WebSocket error for ${clientId}:`, err));
});

// Ping clients every 30s to detect dead connections
setInterval(() => {
  for (const [id, ws] of clients.entries()) {
    if (!ws.isAlive) {
      ws.terminate();
      clients.delete(id);
      console.log(`Terminated dead client: ${id}`);
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Signaling Server running on port ${PORT}`);
});
