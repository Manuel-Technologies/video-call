const WebSocket = require('ws');
const http = require('http');

// Create an HTTP server for Render health checks and WebSocket upgrades
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Signaling Server');
});

// Attach WebSocket server to HTTP server
const wss = new WebSocket.Server({ server });

const clients = new Map();

wss.on('connection', (ws) => {
    // Generate a unique client ID
    const clientId = Math.random().toString(36).substring(2);
    clients.set(clientId, ws);
    console.log(`Client ${clientId} connected`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Broadcast message to all other clients
            clients.forEach((client, id) => {
                if (id !== clientId && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`Client ${clientId} disconnected`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
    });
});

// Bind to Render's dynamic port and host
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('WebSocket signaling ready at wss://<your-render-url>');
});