#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Color Definitions ---
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Ensure script is run as root ---
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root or with sudo.${NC}"
    exit 1
fi

echo -e "${BLUE}Liteshift Uninstallation Script${NC}"

# --- Confirm Uninstallation ---
read -p "Are you sure you want to completely uninstall Liteshift? This will stop the service and cannot be undone. (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uninstallation aborted.${NC}"
    exit 0
fi

LITESHIFT_DIR="/root/liteshift"

# --- Detect which process manager was used ---
PROCESS_MANAGER="pm2"  # default assumption

# Try to read from DB
if [ -d "$LITESHIFT_DIR" ]; then
    PM_FROM_DB=$(node -e "
      try {
        const Database = require('better-sqlite3');
        const path = require('path');
        const db = new Database(path.join('$LITESHIFT_DIR', 'data', 'data.db'));
        const row = db.prepare(\"SELECT value FROM settings WHERE key = 'process_manager'\").get();
        db.close();
        console.log(row ? row.value : 'pm2');
      } catch(e) { console.log('pm2'); }
    " 2>/dev/null || echo "pm2")
    PROCESS_MANAGER="$PM_FROM_DB"
fi

echo -e "\n${BLUE}Detected process manager: ${YELLOW}${PROCESS_MANAGER}${NC}"

# --- Stop and remove the Liteshift service ---
if [ "$PROCESS_MANAGER" = "pm2" ]; then
    echo -e "\n${BLUE}Stopping Liteshift PM2 process...${NC}"
    if command -v pm2 &> /dev/null; then
        pm2 stop liteshift 2>/dev/null && echo -e "${GREEN}PM2 process stopped.${NC}" || echo -e "${YELLOW}PM2 process was not running.${NC}"
        pm2 delete liteshift 2>/dev/null && echo -e "${GREEN}PM2 process deleted.${NC}" || echo -e "${YELLOW}PM2 process not found.${NC}"
        pm2 save 2>/dev/null || true
    else
        echo -e "${YELLOW}PM2 not found. Skipping PM2 cleanup.${NC}"
    fi
else
    SERVICE_NAME="liteshift"
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

    echo -e "\n${BLUE}Stopping and disabling Liteshift systemd service...${NC}"
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        sudo systemctl stop "${SERVICE_NAME}"
        echo -e "${GREEN}Service stopped.${NC}"
    else
        echo -e "${YELLOW}Service is not running.${NC}"
    fi

    if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
        sudo systemctl disable "${SERVICE_NAME}"
        echo -e "${GREEN}Service disabled.${NC}"
    else
        echo -e "${YELLOW}Service is not enabled.${NC}"
    fi

    if [ -f "$SERVICE_FILE" ]; then
        echo -e "${BLUE}Removing service file...${NC}"
        sudo rm -f "$SERVICE_FILE"
        sudo systemctl daemon-reload
        echo -e "${GREEN}Service file removed.${NC}"
    fi
fi

# --- Remove from Caddy ---
echo -e "\n${BLUE}Removing Caddy reverse proxy configuration...${NC}"
CADDYFILE="/etc/caddy/Caddyfile"
APP_PORT="8008"

if [ -f "$CADDYFILE" ]; then
    if grep -q "reverse_proxy localhost:${APP_PORT}" "$CADDYFILE"; then
        # Use sed to delete the block for port 1000
        sudo sed -i '/:1000 {/,/}/d' "$CADDYFILE"
        # Reload Caddy using its own CLI (no systemctl needed)
        caddy reload --config "$CADDYFILE" 2>/dev/null || sudo systemctl reload caddy 2>/dev/null || true
        echo -e "${GREEN}Caddy configuration updated and reloaded.${NC}"
    else
        echo -e "${YELLOW}Caddy reverse proxy configuration not found. Skipping.${NC}"
    fi
else
    echo -e "${YELLOW}Caddyfile not found. Skipping.${NC}"
fi

# --- Remove Liteshift Directory ---
echo -e "\n${BLUE}Liteshift application files are located at ${LITESHIFT_DIR}.${NC}"
read -p "Do you want to completely delete the application directory and all its data (including the database)? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "$LITESHIFT_DIR" ]; then
        sudo rm -rf "$LITESHIFT_DIR"
        echo -e "${GREEN}Directory ${LITESHIFT_DIR} removed successfully.${NC}"
    else
        echo -e "${YELLOW}Directory ${LITESHIFT_DIR} does not exist. Skipping.${NC}"
    fi
else
    echo -e "${YELLOW}Directory ${LITESHIFT_DIR} preserved.${NC}"
fi

echo -e "\n${GREEN}✅ Liteshift has been successfully uninstalled.${NC}"
