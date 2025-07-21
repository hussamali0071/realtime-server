#!/usr/bin/env node

import { getRealtimeServer } from "./realtime-server.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function startRealtimeServer() {
  console.log("🚀 Starting standalone realtime server...");
  console.log(`📦 Node.js version: ${process.version}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);

  try {
    const server = getRealtimeServer();

    // Start the server on configured port
    const port = process.env.REALTIME_PORT
      ? parseInt(process.env.REALTIME_PORT)
      : 3001;

    server.start(port);

    // Gracefully handle shutdown signals
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      try {
        await server.close();
        console.log("✅ Graceful shutdown complete");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("❌ Uncaught Exception:", error);
      gracefulShutdown("uncaughtException");
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
      gracefulShutdown("unhandledRejection");
    });
  } catch (error) {
    console.error("❌ Failed to start realtime server:", error);
    process.exit(1);
  }
}

// Start the server
startRealtimeServer().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
