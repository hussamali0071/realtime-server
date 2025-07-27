#!/bin/bash

# Health check script for the realtime server
# This script checks if the server is responding on port 3001

set -e

# Default port (can be overridden by environment variable)
PORT=${REALTIME_PORT:-3001}

# Check if the server is responding
if curl -f -s http://localhost:${PORT}/health > /dev/null 2>&1; then
    echo "Health check passed: Server is responding on port ${PORT}"
    exit 0
else
    echo "Health check failed: Server is not responding on port ${PORT}"
    exit 1
fi 