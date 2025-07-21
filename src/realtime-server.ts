import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import { Client } from "pg";
import dotenv from "dotenv";
import cors from "cors";

// Load environment variables
dotenv.config();

export class RealtimeServer {
  private io: SocketIOServer;
  private pgClient: Client;
  private httpServer: any;
  private connectedClients = new Map<string, any>();

  constructor() {
    // Create HTTP server for Socket.IO with enhanced endpoints
    this.httpServer = createServer((req, res) => {
      // Set CORS headers for all requests
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "healthy",
            timestamp: new Date().toISOString(),
            connectedClients: this.connectedClients.size,
            uptime: process.uptime(),
            version: "1.0.0",
            service: "realtime-server",
          })
        );
      } else if (req.url === "/stats") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.getStats()));
      } else if (req.url === "/metrics") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.getMetrics()));
      } else if (req.url === "/channels") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.getChannels()));
      } else if (req.url === "/" || req.url === "/info") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            name: "Realtime Server",
            version: "1.0.0",
            description:
              "Standalone WebSocket server for real-time communication",
            endpoints: {
              health: "/health",
              stats: "/stats",
              metrics: "/metrics",
              channels: "/channels",
            },
            websocket: {
              transports: ["websocket", "polling"],
              cors: "enabled",
            },
          })
        );
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found", path: req.url }));
      }
    });

    // Initialize Socket.IO with enhanced configuration
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Initialize PostgreSQL client for NOTIFY/LISTEN
    this.pgClient = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    this.setupSocketHandlers();
    this.setupPgNotifications();
  }

  private setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Store client connection with metadata
      this.connectedClients.set(socket.id, {
        socket,
        connectedAt: new Date().toISOString(),
        subscriptions: new Set<string>(),
      });

      // Handle client subscription to specific channels
      socket.on("subscribe", (channels: string[]) => {
        console.log(`📡 Client ${socket.id} subscribing to:`, channels);
        const clientData = this.connectedClients.get(socket.id);

        channels.forEach((channel) => {
          socket.join(channel);
          if (clientData) {
            clientData.subscriptions.add(channel);
          }
        });

        // Send confirmation
        socket.emit("subscription_success", {
          channels,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle client unsubscription
      socket.on("unsubscribe", (channels: string[]) => {
        console.log(`📡 Client ${socket.id} unsubscribing from:`, channels);
        const clientData = this.connectedClients.get(socket.id);

        channels.forEach((channel) => {
          socket.leave(channel);
          if (clientData) {
            clientData.subscriptions.delete(channel);
          }
        });

        // Send confirmation
        socket.emit("unsubscription_success", {
          channels,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle ping/pong for connection monitoring
      socket.on("ping", () => {
        socket.emit("pong", { timestamp: new Date().toISOString() });
      });

      // Handle client disconnect
      socket.on("disconnect", (reason) => {
        console.log(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
        this.connectedClients.delete(socket.id);
      });

      // Send initial connection confirmation
      socket.emit("connected", {
        id: socket.id,
        timestamp: new Date().toISOString(),
        server: "realtime-server-v1.0.0",
      });
    });
  }

  private async setupPgNotifications() {
    try {
      await this.pgClient.connect();
      console.log("📡 Connected to PostgreSQL for real-time notifications");

      // Listen to all our notification channels
      await this.pgClient.query("LISTEN conversion_message_changes");
      await this.pgClient.query("LISTEN conversion_changes");
      await this.pgClient.query("LISTEN conversion_step_changes");
      await this.pgClient.query("LISTEN test_channel");

      // Handle notifications from PostgreSQL
      this.pgClient.on("notification", (msg) => {
        try {
          const channel = msg.channel;
          const payload = JSON.parse(msg.payload || "{}");

          console.log(
            `📨 Received notification on channel ${channel}:`,
            payload
          );

          // Forward notification to appropriate Socket.IO rooms
          this.handlePgNotification(channel, payload);
        } catch (error) {
          console.error("❌ Error processing notification:", error);
        }
      });

      // Handle PostgreSQL connection errors
      this.pgClient.on("error", (err) => {
        console.error("❌ PostgreSQL notification client error:", err);
        // Attempt to reconnect
        this.reconnectPg();
      });
    } catch (error) {
      console.error("❌ Failed to setup PostgreSQL notifications:", error);
      // Retry connection after delay
      setTimeout(() => this.setupPgNotifications(), 5000);
    }
  }

  private handlePgNotification(channel: string, payload: any) {
    const { operation, table, data } = payload;

    switch (channel) {
      case "conversion_message_changes":
        this.handleConversionMessageChange(operation, data);
        break;

      case "conversion_changes":
        this.handleConversionChange(operation, data);
        break;

      case "conversion_step_changes":
        this.handleConversionStepChange(operation, data);
        break;

      case "test_channel":
        this.io.emit("test_notification", { message: payload });
        break;

      default:
        console.log(`🤷 Unknown notification channel: ${channel}`);
        // Forward unknown channels as-is
        this.io.to(channel).emit("postgres_changes", {
          event: operation || "UNKNOWN",
          schema: "public",
          table: table || "unknown",
          new: data,
          old: null,
          channel,
        });
    }
  }

  private handleConversionMessageChange(operation: string, data: any) {
    // Emit to all clients subscribed to conversion messages
    this.io.to("conversion-messages").emit("postgres_changes", {
      event: operation,
      schema: "public",
      table: "ConversionMessage",
      new: operation === "DELETE" ? null : data,
      old: operation === "INSERT" ? null : data,
    });

    // Also emit to specific conversion channel if available
    if (data.conversionId) {
      this.io.to(`conversion-${data.conversionId}`).emit("postgres_changes", {
        event: operation,
        schema: "public",
        table: "ConversionMessage",
        new: operation === "DELETE" ? null : data,
        old: operation === "INSERT" ? null : data,
      });
    }
  }

  private handleConversionChange(operation: string, data: any) {
    // Emit to all clients subscribed to conversions
    this.io.to("conversions").emit("postgres_changes", {
      event: operation,
      schema: "public",
      table: "Conversion",
      new: operation === "DELETE" ? null : data,
      old: operation === "INSERT" ? null : data,
    });
  }

  private handleConversionStepChange(operation: string, data: any) {
    // Emit to all clients subscribed to conversion steps
    this.io.to("conversion-steps").emit("postgres_changes", {
      event: operation,
      schema: "public",
      table: "ConversionStep",
      new: operation === "DELETE" ? null : data,
      old: operation === "INSERT" ? null : data,
    });

    // Also emit to specific conversion channel
    if (data.conversionId) {
      this.io.to(`conversion-${data.conversionId}`).emit("postgres_changes", {
        event: operation,
        schema: "public",
        table: "ConversionStep",
        new: operation === "DELETE" ? null : data,
        old: operation === "INSERT" ? null : data,
      });
    }
  }

  private async reconnectPg() {
    try {
      console.log("🔄 Attempting to reconnect to PostgreSQL...");
      await this.pgClient.end();
      this.pgClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await this.setupPgNotifications();
    } catch (error) {
      console.error("❌ Failed to reconnect to PostgreSQL:", error);
      // Retry after 5 seconds
      setTimeout(() => this.reconnectPg(), 5000);
    }
  }

  public start(port: number = 3001) {
    const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "0.0.0.0";

    this.httpServer.listen(port, host, () => {
      console.log(`🚀 Realtime Server v1.0.0 running on ${host}:${port}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📡 CORS enabled for all origins`);
      console.log(`🔗 WebSocket transports: websocket, polling`);
      console.log(`📊 Health check: http://${host}:${port}/health`);
    });

    // Add error handling for server startup
    this.httpServer.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${port} is already in use`);
        process.exit(1);
      } else {
        console.error("❌ Server error:", error);
        process.exit(1);
      }
    });
  }

  public getStats() {
    return {
      connectedClients: this.connectedClients.size,
      rooms: Array.from(this.io.sockets.adapter.rooms.keys()),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  public getMetrics() {
    const clients = Array.from(this.connectedClients.values());
    return {
      totalClients: this.connectedClients.size,
      totalRooms: this.io.sockets.adapter.rooms.size,
      clientsPerRoom: Object.fromEntries(
        Array.from(this.io.sockets.adapter.rooms.entries()).map(
          ([room, sockets]) => [room, sockets.size]
        )
      ),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    };
  }

  public getChannels() {
    const channels = new Map<string, any>();

    this.io.sockets.adapter.rooms.forEach((sockets, room) => {
      if (!sockets.has(room)) {
        // Skip individual socket rooms
        channels.set(room, {
          name: room,
          clientCount: sockets.size,
          clients: Array.from(sockets),
        });
      }
    });

    return {
      totalChannels: channels.size,
      channels: Object.fromEntries(channels),
      timestamp: new Date().toISOString(),
    };
  }

  public async close() {
    console.log("🛑 Shutting down realtime server...");
    try {
      await this.pgClient.end();
      this.httpServer.close();
      console.log("✅ Realtime server shutdown complete");
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
    }
  }
}

// Export singleton instance
let realtimeServer: RealtimeServer | null = null;

export const getRealtimeServer = () => {
  if (!realtimeServer) {
    realtimeServer = new RealtimeServer();
  }
  return realtimeServer;
};
