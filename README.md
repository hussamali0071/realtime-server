# Realtime Server

A standalone WebSocket server for real-time communication using Socket.IO and PostgreSQL LISTEN/NOTIFY.

## Features

- **WebSocket Communication**: Socket.IO server with websocket and polling transports
- **PostgreSQL Integration**: Real-time notifications using PostgreSQL LISTEN/NOTIFY
- **Health Monitoring**: Built-in health checks and metrics endpoints
- **Channel Management**: Support for subscription-based channels
- **Docker Ready**: Production-ready Docker configuration
- **Graceful Shutdown**: Proper cleanup on process termination
- **CORS Support**: Configurable CORS for cross-origin requests

## Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL database with LISTEN/NOTIFY triggers configured
- Environment variables configured (see Configuration section)

### Installation

```bash
npm install
```

### Development

```bash
# Start in development mode with auto-reload
npm run dev
```

### Production

```bash
# Build the TypeScript project
npm run build

# Start in production mode
npm start
```

## Configuration

Copy `config.example.env` to `.env` and configure the following variables:

### Required Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REALTIME_PORT`: Port for the server (default: 3001)

### Optional Variables

- `NODE_ENV`: Environment mode (development/production)
- `HOST`: Host binding (default: 0.0.0.0)
- Socket.IO and PostgreSQL pool settings

## API Endpoints

### Health Check

```
GET /health
```

Returns server health status, uptime, and connected clients count.

### Statistics

```
GET /stats
```

Returns real-time statistics including connected clients and active rooms.

### Metrics

```
GET /metrics
```

Returns detailed metrics including memory usage and performance data.

### Channels

```
GET /channels
```

Returns information about active channels and their subscribers.

### Server Info

```
GET / or GET /info
```

Returns general server information and available endpoints.

## WebSocket Events

### Client Events

- `subscribe`: Subscribe to channels
- `unsubscribe`: Unsubscribe from channels
- `ping`: Connection health check

### Server Events

- `connected`: Connection confirmation
- `postgres_changes`: Database change notifications
- `subscription_success`: Subscription confirmation
- `unsubscription_success`: Unsubscription confirmation
- `pong`: Response to ping

## PostgreSQL Integration

The server listens to the following PostgreSQL notification channels:

- `conversion_message_changes`
- `conversion_changes`
- `conversion_step_changes`
- `test_channel`

### Setting Up Database Triggers

Make sure your PostgreSQL database has the appropriate triggers configured to send notifications to these channels when data changes occur.

## Docker Deployment

### Build Docker Image

```bash
npm run build:docker
```

### Run with Docker

```bash
docker run -p 3001:3001 --env-file .env realtime-server
```

### Docker Compose

```yaml
version: "3.8"
services:
  realtime:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REALTIME_PORT=3001
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "/health-check.sh"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

## Client Connection

### JavaScript/TypeScript Client

```javascript
import { io } from "socket.io-client";

const socket = io("ws://localhost:3001", {
  transports: ["websocket", "polling"],
  autoConnect: true,
  reconnection: true,
});

socket.on("connect", () => {
  console.log("Connected to realtime server");

  // Subscribe to channels
  socket.emit("subscribe", ["conversions", "conversion-messages"]);
});

socket.on("postgres_changes", (payload) => {
  console.log("Database change:", payload);
});
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Client App    │◄──►│  Realtime Server │◄──►│   PostgreSQL     │
│                 │    │                  │    │                  │
│ - Socket.IO     │    │ - Socket.IO      │    │ - LISTEN/NOTIFY  │
│ - Subscriptions │    │ - HTTP API       │    │ - Triggers       │
│ - Real-time UI  │    │ - Channel Mgmt   │    │ - Change Events  │
└─────────────────┘    └──────────────────┘    └──────────────────┘
```

## Monitoring

### Health Checks

The server provides health check endpoints that can be used with load balancers, container orchestrators, or monitoring systems:

- Health status: `GET /health`
- Detailed metrics: `GET /metrics`
- Channel information: `GET /channels`

### Logging

The server uses structured logging with emojis for easy identification:

- 🚀 Server startup
- 🔌 Client connections/disconnections
- 📡 Subscriptions and PostgreSQL events
- ❌ Errors and warnings
- 🛑 Shutdown events

## Security Considerations

- The server runs as a non-root user in Docker
- CORS is configurable (default: allow all origins)
- Health check endpoints are publicly accessible
- WebSocket connections should be secured with proper authentication in production

## Performance

- Automatic reconnection for PostgreSQL connections
- Connection pooling for database operations
- Graceful handling of client disconnections
- Memory usage monitoring and reporting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License
