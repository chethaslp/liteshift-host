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

# --- Large Banner ---
echo -e "${BLUE}"
cat <<'BANNER'
        ██╗     ██╗████████╗███████╗███████╗██╗  ██╗██╗███████╗████████╗
        ██║     ██║╚══██╔══╝██╔════╝██╔════╝██║  ██║██║██╔════╝╚══██╔══╝
        ██║     ██║   ██║   █████╗  ███████╗███████║██║█████╗     ██║   
        ██║     ██║   ██║   ██╔══╝  ╚════██║██╔══██║██║██╔══╝     ██║   
        ███████╗██║   ██║   ███████╗███████║██║  ██║██║██║        ██║   
        ╚══════╝╚═╝   ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   
                          github.com/chethaslp                                    
BANNER
echo -e "${NC}"

echo -e "${BLUE}Liteshift Installation Script${NC}"

# --- Update Package Manager ---
echo -e "\n${BLUE}Updating package lists...${NC}"
sudo apt-get update

# --- Install Core Dependencies (Git, Python, Node.js, etc.) ---
echo -e "\n${BLUE}Installing Git, Python, Pip, Node.js, npm, Curl, and Unzip...${NC}"

# Ensure curl is available before using it to set up Node.js or Bun
sudo apt-get install -y curl

if command -v node &> /dev/null
then
    echo -e "${YELLOW}Node.js is already installed. Skipping installation.${NC}"
else
    echo -e "${BLUE}Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install other required packages
sudo apt-get install -y git python3 python3-pip unzip

# --- Install Bun (https://bun.sh) ---
if command -v bun &> /dev/null
then
    echo -e "${YELLOW}Bun is already installed. Skipping installation.${NC}"
else
    echo -e "${BLUE}Installing Bun (bun.sh)...${NC}"
    # Run Bun install script (runs as root in this script). The installer places bun in /root/.bun for root.
    curl -fsSL https://bun.sh/install | bash

    # Create a symlink so bun is available on PATH for system scripts
    if [ -f "/root/.bun/bin/bun" ]; then
        sudo ln -sf /root/.bun/bin/bun /usr/local/bin/bun
        echo -e "${GREEN}Bun installed and symlinked to /usr/local/bin/bun.${NC}"
    else
        echo -e "${RED}Bun installation did not produce /root/.bun/bin/bun. Please check the installer output.${NC}"
    fi
fi

# --- Clone Liteshift Repository ---
echo -e "\n${BLUE}Cloning Liteshift repository from GitHub...${NC}"
LITESHIFT_DIR="/root/liteshift"
if [ -d "$LITESHIFT_DIR" ]; then
    echo -e "${YELLOW}Liteshift directory already exists. Pulling latest changes...${NC}"
    cd "$LITESHIFT_DIR"
    git pull
else
    echo -e "${BLUE}Cloning repository...${NC}"
    git clone https://github.com/chethaslp/liteshift-host.git "$LITESHIFT_DIR"
    cd "$LITESHIFT_DIR"
fi

# --- Install Node.js project dependencies ---
echo -e "\n${BLUE}Installing project packages using npm...${NC}"
npm install

# --- Build the project ---
echo -e "\n${BLUE}Building the project...${NC}"
npm run build
echo -e "${GREEN}Build complete.${NC}"

# --- Install Caddy ---
echo -e "\n${BLUE}Installing Caddy...${NC}"
if command -v caddy &> /dev/null
then
    echo -e "${YELLOW}Caddy is already installed. Skipping installation.${NC}"
else
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt-get update
    sudo apt-get install -y caddy
    echo -e "${GREEN}Caddy installation complete.${NC}"
fi

# --- Create and start Liteshift service ---
echo -e "\n${BLUE}Creating systemd service for Liteshift...${NC}"

NPM_PATH=$(which npm)
SERVICE_NAME="liteshift"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Create the service file
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Liteshift Application
After=network.target

[Service]
ExecStart=${NPM_PATH} start
WorkingDirectory=/root/liteshift
Restart=always
User=root
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}Service file created at ${SERVICE_FILE}${NC}"

# --- Setup Caddy Reverse Proxy ---
echo -e "\n${BLUE}Setting up Caddy reverse proxy...${NC}"
CADDYFILE="/etc/caddy/Caddyfile"
APP_PORT="8008"
PROXY_PORT="1000"
PROXY_CONFIG=":${PROXY_PORT} {\n    reverse_proxy localhost:${APP_PORT}\n}"

# Check if the config already exists to avoid duplicates
if ! grep -q "reverse_proxy localhost:${APP_PORT}" "$CADDYFILE"; then
    echo -e "Adding reverse proxy config to Caddyfile: Port ${PROXY_PORT} -> ${APP_PORT}"
    # Append the new configuration
    echo -e "\n${PROXY_CONFIG}" | sudo tee -a "$CADDYFILE" > /dev/null
    sudo systemctl reload caddy
    echo -e "${GREEN}Caddy configuration updated and reloaded.${NC}"
else
    echo -e "${YELLOW}Caddy reverse proxy configuration already exists. Skipping.${NC}"
fi

# --- Reload systemd and start services ---
echo -e "\n${BLUE}Reloading systemd and starting the Liteshift service...${NC}"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}.service"
sudo systemctl restart "${SERVICE_NAME}.service"

echo -e "${GREEN}Liteshift service has been enabled and started.${NC}"

# --- Final message ---
echo -e "\n${GREEN}Liteshift is installed and running as a service!${NC}"
echo -e "Now running: ${YELLOW}sudo systemctl status ${SERVICE_NAME}${NC}"
sudo systemctl status liteshift