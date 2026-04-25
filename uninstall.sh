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

# --- Stop and disable Liteshift service ---
SERVICE_NAME="liteshift"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo -e "\n${BLUE}Stopping and disabling Liteshift service...${NC}"
if systemctl is-active --quiet "${SERVICE_NAME}"; then
    sudo systemctl stop "${SERVICE_NAME}"
    echo -e "${GREEN}Service stopped.${NC}"
else
    echo -e "${YELLOW}Service is not running.${NC}"
fi

if systemctl is-enabled --quiet "${SERVICE_NAME}"; then
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

# --- Remove from Caddy ---
echo -e "\n${BLUE}Removing Caddy reverse proxy configuration...${NC}"
CADDYFILE="/etc/caddy/Caddyfile"
APP_PORT="8008"

if [ -f "$CADDYFILE" ]; then
    if grep -q "reverse_proxy localhost:${APP_PORT}" "$CADDYFILE"; then
        # Use sed to delete the block for port 1000
        sudo sed -i '/:1000 {/,/}/d' "$CADDYFILE"
        sudo systemctl reload caddy
        echo -e "${GREEN}Caddy configuration updated and reloaded.${NC}"
    else
        echo -e "${YELLOW}Caddy reverse proxy configuration not found. Skipping.${NC}"
    fi
else
    echo -e "${YELLOW}Caddyfile not found. Skipping.${NC}"
fi

# --- Remove Liteshift Directory ---
LITESHIFT_DIR="/root/liteshift"
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

echo -e "\n${GREEN}Liteshift has been successfully uninstalled.${NC}"
