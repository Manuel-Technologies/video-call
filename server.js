// Import dependencies
const WebSocket = require('ws');
const http = require('http');

// Create HTTP server (for Render health checks + WebSocket upgrades)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebRTC Video Call Signaling Server');
});

// Attach WebSocket server to the HTTP server
const wss = new WebSocket.Server({ server });

// Store all connected clients and their rooms
const clients = new Map(); // clientId -> WebSocket
const rooms = new Map();   // roomId -> Set of clientIds

// Handle new connections
wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substring(2, 10);
  clients.set(clientId, ws);
  console.log(`Client connected: ${clientId}`);

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const { type, roomId, payload } = data;

      switch (type) {
        case 'join':
          if (!rooms.has(roomId)) rooms.set(roomId, new Set());
          rooms.get(roomId).add(clientId);
          console.log(`Client ${clientId} joined room ${roomId}`);

          // Notify other users in the room that someone joined
          broadcast(roomId, clientId, {
            type: 'user-joined',
            from: clientId,
          });
          break;

        case 'offer':
        case 'answer':
        case 'candidate':
          // Forward signaling messages to other peers in the same room
          broadcast(roomId, clientId, {
            type,
            from: clientId,
            payload,
          });
          break;

        default:
          console.log(`Unknown message type: ${type}`);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    clients.delete(clientId);
    // Remove from rooms
    for (const [roomId, members] of rooms.entries()) {
      if (members.delete(clientId)) {
        broadcast(roomId, clientId, {
          type: 'user-left',
          from: clientId,
        });
        if (members.size === 0) rooms.delete(roomId);
      }
    }
    console.log(`Client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for client ${clientId}:`, err);
  });
});

// Broadcast helper (send message to everyone else in the room)
function broadcast(roomId, senderId, message) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const id of room) {
    if (id !== senderId) {
      const client = clients.get(id);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  }
}

// Start the server (Render assigns PORT)
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Video Call Signaling Server running on port ${PORT}`);
  console.log('🌐 Ready for WebRTC connections via wss://<your-render-url>');
});