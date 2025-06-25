#!/bin/bash
# MailCraft Desktop Launcher

echo "Starting MailCraft Desktop..."

# Kill any existing instances
pkill -f "electron.*mailcraft" 2>/dev/null

# Clear npm cache
npm cache clean --force 2>/dev/null

# Start the app
npm start