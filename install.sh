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

# --- Create Admin User ---
echo -e "\n${BLUE}Setting up admin credentials...${NC}"

# Check if an admin user already exists by running a quick check
EXISTING_USER=$(node ./build/setup.js --check-user 2>/dev/null || echo "0")

if [ "$EXISTING_USER" -gt 0 ] 2>/dev/null; then
    echo -e "${YELLOW}An admin user already exists. Skipping credential setup.${NC}"
else
    # Prompt for username
    while true; do
        read -p "$(echo -e "${GREEN}Enter admin username (min 3 characters): ${NC}")" ADMIN_USERNAME
        if [ ${#ADMIN_USERNAME} -ge 3 ]; then
            break
        fi
        echo -e "${RED}Username must be at least 3 characters long. Try again.${NC}"
    done

    # Prompt for password (hidden input)
    while true; do
        read -s -p "$(echo -e "${GREEN}Enter admin password (min 6 characters): ${NC}")" ADMIN_PASSWORD
        echo ""
        if [ ${#ADMIN_PASSWORD} -ge 6 ]; then
            read -s -p "$(echo -e "${GREEN}Confirm admin password: ${NC}")" ADMIN_PASSWORD_CONFIRM
            echo ""
            if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]; then
                break
            fi
            echo -e "${RED}Passwords do not match. Try again.${NC}"
        else
            echo -e "${RED}Password must be at least 6 characters long. Try again.${NC}"
        fi
    done

    # Run the setup script to create the admin user
    echo -e "${BLUE}Creating admin user...${NC}"
    node ./build/setup.js --create-admin "$ADMIN_USERNAME" "$ADMIN_PASSWORD"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Admin user created successfully.${NC}"
    else
        echo -e "${RED}Failed to create admin user. You can re-run: node ./build/setup.js --create-admin <username> <password>${NC}"
    fi

    # Clear password variables from memory
    unset ADMIN_PASSWORD
    unset ADMIN_PASSWORD_CONFIRM
fi

# ============================================================
# --- Choose Process Manager ---
# ============================================================
echo -e "\n${BLUE}Process Manager Selection${NC}"
echo -e "Liteshift needs a process manager to keep your apps running and restart them on reboot."
echo -e ""
echo -e "  ${GREEN}[1] PM2${NC}         - Recommended. No root required for app restarts."
echo -e "  ${YELLOW}[2] systemd${NC}     - Traditional Linux service manager (requires sudo)."
echo -e ""

PROCESS_MANAGER="pm2"  # default

while true; do
    read -p "$(echo -e "${GREEN}Choose process manager [1/2] (default: 1 - PM2): ${NC}")" PM_CHOICE
    PM_CHOICE="${PM_CHOICE:-1}"
    case "$PM_CHOICE" in
        1)
            PROCESS_MANAGER="pm2"
            echo -e "${GREEN}Selected: PM2${NC}"
            break
            ;;
        2)
            PROCESS_MANAGER="systemctl"
            echo -e "${YELLOW}Selected: systemd / systemctl${NC}"
            break
            ;;
        *)
            echo -e "${RED}Invalid choice. Please enter 1 or 2.${NC}"
            ;;
    esac
done

# --- Save the process manager choice to the database ---
node ./build/setup.js --set-setting "process_manager" "$PROCESS_MANAGER" || echo -e "${YELLOW}Warning: Could not persist process manager choice to DB. Default (pm2) will be used.${NC}"

# ============================================================
# --- Setup PM2 (if chosen) ---
# ============================================================
if [ "$PROCESS_MANAGER" = "pm2" ]; then
    echo -e "\n${BLUE}Setting up PM2...${NC}"

    if command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}PM2 is already installed. Skipping installation.${NC}"
    else
        echo -e "${BLUE}Installing PM2 globally...${NC}"
        npm install -g pm2
        echo -e "${GREEN}PM2 installed.${NC}"
    fi

    # Start Liteshift via PM2
    echo -e "\n${BLUE}Starting Liteshift with PM2...${NC}"
    NPM_PATH=$(which npm)

    pm2 delete liteshift 2>/dev/null || true
    pm2 start "$NPM_PATH" \
        --name liteshift \
        --cwd "$LITESHIFT_DIR" \
        -- start

    # Save pm2 list and set up startup hook
    pm2 save
    echo -e "${BLUE}Configuring PM2 to start on system boot...${NC}"
    pm2 startup | tail -1 | bash || echo -e "${YELLOW}Could not auto-configure pm2 startup. Run 'pm2 startup' manually and follow the instructions.${NC}"

    echo -e "${GREEN}Liteshift is running under PM2.${NC}"
    echo -e "Use ${YELLOW}pm2 status liteshift${NC} to check the service status."
    echo -e "Use ${YELLOW}pm2 logs liteshift${NC} to view logs."

# ============================================================
# --- Setup systemd (if chosen) ---
# ============================================================
else
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

    # Reload systemd and start services
    echo -e "\n${BLUE}Reloading systemd and starting the Liteshift service...${NC}"
    sudo systemctl daemon-reload
    sudo systemctl enable "${SERVICE_NAME}.service"
    sudo systemctl restart "${SERVICE_NAME}.service"

    echo -e "${GREEN}Liteshift service has been enabled and started.${NC}"
    echo -e "Use ${YELLOW}sudo systemctl status ${SERVICE_NAME}${NC} to check the service status."
fi

# ============================================================
# --- Choose Reverse Proxy ---
# ============================================================
echo -e "\n${BLUE}Reverse Proxy Selection${NC}"
echo -e "Liteshift needs a way to route traffic to your apps and handle SSL."
echo -e ""
echo -e "  ${GREEN}[1] Caddy${NC}              - Automatic SSL, local proxy, fast & easy."
echo -e "  ${YELLOW}[2] Cloudflare Tunnel${NC}  - Secure exposure without opening ports (cloudflared)."
echo -e ""

REVERSE_PROXY="caddy"  # default

while true; do
    read -p "$(echo -e "${GREEN}Choose reverse proxy [1/2] (default: 1 - Caddy): ${NC}")" RP_CHOICE
    RP_CHOICE="${RP_CHOICE:-1}"
    case "$RP_CHOICE" in
        1)
            REVERSE_PROXY="caddy"
            echo -e "${GREEN}Selected: Caddy${NC}"
            break
            ;;
        2)
            REVERSE_PROXY="cloudflare"
            echo -e "${YELLOW}Selected: Cloudflare Tunnel${NC}"
            break
            ;;
        *)
            echo -e "${RED}Invalid choice. Please enter 1 or 2.${NC}"
            ;;
    esac
done

# --- Save the reverse proxy choice to the database ---
node ./build/setup.js --set-setting "reverse_proxy" "$REVERSE_PROXY" || echo -e "${YELLOW}Warning: Could not persist reverse proxy choice to DB. Default (caddy) will be used.${NC}"

# ============================================================
# --- Setup Reverse Proxy ---
# ============================================================
if [ "$REVERSE_PROXY" = "caddy" ]; then
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

# --- Setup Caddy Reverse Proxy ---
echo -e "\n${BLUE}Setting up Caddy reverse proxy...${NC}"
CADDYFILE="/etc/caddy/Caddyfile"
APP_PORT="8008"
PROXY_PORT="1000"
PROXY_CONFIG=":${PROXY_PORT} {\n    reverse_proxy localhost:${APP_PORT}\n}"

# Check if the config already exists to avoid duplicates
if ! grep -q "reverse_proxy localhost:${APP_PORT}" "$CADDYFILE" 2>/dev/null; then
    echo -e "Adding reverse proxy config to Caddyfile: Port ${PROXY_PORT} -> ${APP_PORT}"
    echo -e "\n${PROXY_CONFIG}" | sudo tee -a "$CADDYFILE" > /dev/null
    # Reload Caddy using its own CLI (no systemctl needed)
    caddy reload --config "$CADDYFILE" 2>/dev/null || sudo systemctl reload caddy 2>/dev/null || true
    echo -e "${GREEN}Caddy configuration updated and reloaded.${NC}"
else
    echo -e "${YELLOW}Caddy reverse proxy configuration already exists. Skipping.${NC}"
fi

elif [ "$REVERSE_PROXY" = "cloudflare" ]; then
    # --- Install Cloudflare Tunnel (cloudflared) ---
    echo -e "\n${BLUE}Installing Cloudflare Tunnel (cloudflared)...${NC}"
    if command -v cloudflared &> /dev/null
    then
        echo -e "${YELLOW}Cloudflared is already installed. Skipping installation.${NC}"
    else
        curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared.deb
        rm cloudflared.deb
        echo -e "${GREEN}Cloudflared installation complete.${NC}"
    fi
    echo -e "${YELLOW}Note: You will need to configure your Cloudflare Tunnel manually in the dashboard or via CLI.${NC}"
fi

# --- Final message ---
echo -e "\n${GREEN}✅ Liteshift is installed and running!${NC}"
echo -e "Access the dashboard at: ${YELLOW}http://<your-server-ip>:1000${NC}"