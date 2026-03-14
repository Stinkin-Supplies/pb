#!/bin/bash
# ============================================================
# POWERSPORTS WORKER VPS — COMPLETE SETUP SCRIPT
# ============================================================
# Run this ONCE on a fresh Hetzner CX21 Ubuntu 24.04 server
# Takes about 5 minutes total
#
# Usage:
#   ssh root@your-vps-ip
#   curl -fsSL https://your-repo/setup.sh | bash
#   -- OR --
#   Copy this file up and run: bash setup.sh
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }

log "Starting Powersports VPS setup..."

# ─── 1. SYSTEM UPDATE ─────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git vim htop \
  ufw fail2ban \
  ca-certificates gnupg lsb-release

# ─── 2. DOCKER ────────────────────────────────────────────────
log "Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y -qq \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

log "Docker installed: $(docker --version)"

# ─── 3. DEPLOY USER ───────────────────────────────────────────
log "Creating deploy user..."
if ! id "deploy" &>/dev/null; then
  useradd -m -s /bin/bash deploy
  usermod -aG docker deploy
  mkdir -p /home/deploy/.ssh
  # Copy root's authorized keys so your SSH key works for deploy user too
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true
  chown -R deploy:deploy /home/deploy/.ssh
  log "Created 'deploy' user — SSH in as: ssh deploy@your-vps-ip"
fi

# ─── 4. FIREWALL ──────────────────────────────────────────────
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
# Note: Redis (6379), Typesense (8108), BullBoard (3001) are NOT exposed
# They bind to 127.0.0.1 only — access via SSH tunnel
ufw --force enable
log "Firewall enabled. Only port 22 (SSH) is open externally."

# ─── 5. FAIL2BAN ──────────────────────────────────────────────
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
EOF
systemctl enable fail2ban
systemctl restart fail2ban

# ─── 6. APP DIRECTORY ─────────────────────────────────────────
log "Setting up app directory..."
mkdir -p /opt/powersports
chown deploy:deploy /opt/powersports

# ─── 7. ENVIRONMENT FILE ──────────────────────────────────────
log "Creating environment template..."
cat > /opt/powersports/.env.example << 'EOF'
# ── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# ── Redis ────────────────────────────────────────────────────
REDIS_PASSWORD=change-this-to-a-long-random-string

# ── Typesense ────────────────────────────────────────────────
TYPESENSE_API_KEY=change-this-to-a-long-random-string

# ── App ──────────────────────────────────────────────────────
SITE_URL=https://yourstore.com
ADMIN_EMAIL=you@yourstore.com
AUTO_FIX_MAP_VIOLATIONS=true

# ── Email ─────────────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=orders@yourstore.com
EMAIL_FROM_NAME=YourStore Powersports

# ── Vendors ──────────────────────────────────────────────────
WPS_API_KEY=
WPS_ACCOUNT_NUMBER=
DS_FTP_HOST=ftp.dragspecialties.com
DS_FTP_USER=
DS_FTP_PASSWORD=
DS_ACCOUNT_NUMBER=

# ── Bull Board ───────────────────────────────────────────────
BOARD_USERNAME=admin
BOARD_PASSWORD=change-this

# ── Stripe (for webhook verification in workers) ─────────────
STRIPE_WEBHOOK_SECRET=whsec_
EOF

chown deploy:deploy /opt/powersports/.env.example
warn "Copy .env.example to .env and fill in all values before starting"

# ─── 8. SWAP (important for 4GB RAM VPS) ─────────────────────
log "Configuring swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Tune swap usage — only swap when RAM is nearly full
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -p
  log "2GB swap created"
fi

# ─── 9. LOG ROTATION ──────────────────────────────────────────
log "Configuring log rotation for Docker..."
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

# ─── 10. SYSTEMD SERVICE (auto-start on reboot) ───────────────
log "Creating systemd service..."
cat > /etc/systemd/system/powersports-workers.service << 'EOF'
[Unit]
Description=Powersports Worker Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/powersports
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300
User=deploy
Group=deploy

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable powersports-workers
log "Workers will auto-start on server reboot"

# ─── 11. USEFUL ALIASES ───────────────────────────────────────
cat >> /home/deploy/.bashrc << 'EOF'

# Powersports aliases
alias ps-logs='cd /opt/powersports && docker compose logs -f --tail=50'
alias ps-status='cd /opt/powersports && docker compose ps'
alias ps-restart='cd /opt/powersports && docker compose restart'
alias ps-pull='cd /opt/powersports && git pull && docker compose up -d --build'
alias ps-redis='docker exec -it ps_redis redis-cli --pass $REDIS_PASSWORD'
EOF

# ─── DONE ─────────────────────────────────────────────────────
log ""
log "✅ VPS setup complete!"
log ""
log "Next steps:"
log "  1. SSH as deploy user:  ssh deploy@$(curl -s ifconfig.me)"
log "  2. cd /opt/powersports"
log "  3. git clone your-workers-repo ."
log "  4. cp .env.example .env && nano .env"
log "  5. docker compose up -d"
log ""
log "Access Bull Board (job dashboard):"
log "  SSH tunnel: ssh -L 3001:localhost:3001 deploy@$(curl -s ifconfig.me)"
log "  Then open:  http://localhost:3001"
log ""
log "Monitor logs:  ssh deploy@$(curl -s ifconfig.me) -t 'cd /opt/powersports && docker compose logs -f'"
