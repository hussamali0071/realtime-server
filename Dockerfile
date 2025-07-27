FROM node:18-slim AS deps
WORKDIR /app

# Install OpenSSL, curl and other required dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Build stage
FROM node:18-slim AS builder
WORKDIR /app

# Install OpenSSL, curl and other required dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy all files and dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Production stage
FROM node:18-slim AS production
WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy health check script
COPY health-check.sh /health-check.sh
RUN chmod +x /health-check.sh

# Create non-root user for security
RUN groupadd -r realtime && useradd -r -g realtime realtime
RUN chown -R realtime:realtime /app
USER realtime

# Expose port (configurable via REALTIME_PORT)
EXPOSE 3001

# Health check using HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD /health-check.sh

# Start realtime server
CMD ["node", "dist/index.js"] 