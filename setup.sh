#!/usr/bin/env bash
# ============================================================
#  Jira / Confluence Automation — One-click setup & launcher
#  Usage:
#    First time:  bash setup.sh
#    Next time:   bash setup.sh          (skips install, just starts)
#    Dev mode:    bash setup.sh --dev
#    Stop server: bash setup.sh --stop
# ============================================================

set -e

# ── Colours ─────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶  $*${NC}"; }

PIDFILE=".server.pid"
PORTFILE=".server.port"
DEV_MODE=false

# ── Find a free port ─────────────────────────────────────────
# Tries ports in range 3100-3999 and returns the first free one.
find_free_port() {
  for port in $(shuf -i 3100-3999 -n 900 2>/dev/null || seq 3100 3999); do
    if ! lsof -iTCP:"$port" -sTCP:LISTEN -t &>/dev/null 2>&1; then
      echo "$port"
      return
    fi
  done
  error "Could not find a free port in range 3100-3999."
}

# ── Stop server ──────────────────────────────────────────────
stop_server() {
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    PORT_USED=$(cat "$PORTFILE" 2>/dev/null || echo "unknown")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      rm -f "$PIDFILE" "$PORTFILE"
      success "Server stopped (was running on port $PORT_USED, PID $PID)"
    else
      warn "Server process $PID is no longer running"
      rm -f "$PIDFILE" "$PORTFILE"
    fi
  else
    warn "No .server.pid file found — server may not be running"
  fi
}

# ── Parse flags ──────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --dev)  DEV_MODE=true ;;
    --stop) stop_server; exit 0 ;;
  esac
done

# ── Banner ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   ⚡  Jira Automation  —  Setup & Run    ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Node.js check ────────────────────────────────────
step "Checking prerequisites"

if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Download it from https://nodejs.org (v18 or later)"
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  error "Node.js v18+ required. You have $(node -v). Download from https://nodejs.org"
fi
success "Node.js $(node -v) found"

if ! command -v npm &>/dev/null; then
  error "npm is not installed. It usually comes with Node.js."
fi
success "npm $(npm -v) found"

# ── Step 2: Install dependencies ─────────────────────────────
step "Installing dependencies"

if [ -d "node_modules" ] && [ -f "package-lock.json" ]; then
  info "node_modules already present — running npm ci for a clean install"
  npm ci --prefer-offline --silent 2>&1 | tail -3 || npm install --silent
else
  info "Installing packages (this may take ~30 seconds)..."
  npm install --silent
fi
success "Dependencies installed"

# ── Step 3: Config setup ─────────────────────────────────────
step "Checking configuration"

if [ ! -f "config.json" ]; then
  if [ -f "config.example.json" ]; then
    # Strip the _comment field before copying
    if command -v node &>/dev/null; then
      node -e "
        const c = require('./config.example.json');
        delete c._comment;
        require('fs').writeFileSync('config.json', JSON.stringify(c, null, 2));
      "
    else
      cp config.example.json config.json
    fi
    warn "Created config.json from template — fill in your credentials at the /config page"
  else
    cat > config.json <<'JSON'
{
  "jira": {
    "baseUrl": "",
    "email": "",
    "apiToken": "",
    "username": "",
    "password": "",
    "defaultProject": "",
    "isCloud": false,
    "serverAuthMode": "pat"
  },
  "confluence": {
    "baseUrl": "",
    "email": "",
    "apiToken": "",
    "username": "",
    "password": "",
    "spaceKey": "",
    "parentPageId": ""
  },
  "teams": {
    "defaultWebhookUrl": "",
    "notifyChannel": "teams"
  },
  "alerts": {
    "rules": [],
    "pollIntervalMinutes": 15
  }
}
JSON
    warn "Created blank config.json — fill in your credentials at the /config page"
  fi
else
  success "config.json exists"
fi

# ── Step 4: Pick a free port ─────────────────────────────────
step "Finding available port"
PORT=$(find_free_port)
success "Using port $PORT"

# ── Step 5: Build + Start ────────────────────────────────────
if [ "$DEV_MODE" = true ]; then
  step "Starting in development mode (hot reload)"
  info "Port: $PORT  —  Press Ctrl+C to stop"
  echo ""
  npm run dev -- --port "$PORT"
else
  step "Building for production"
  info "Building optimised bundle..."
  npm run build --silent

  step "Starting production server"
  npm start -- --port "$PORT" &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PIDFILE"
  echo "$PORT"       > "$PORTFILE"

  # Wait until the server is actually responding (up to 15s)
  echo -ne "${BLUE}ℹ${NC}  Waiting for server"
  for i in $(seq 1 30); do
    if curl -s "http://localhost:${PORT}" -o /dev/null 2>/dev/null; then
      break
    fi
    echo -n "."
    sleep 0.5
  done
  echo ""

  success "Server running on port $PORT (PID $SERVER_PID)"

  URL="http://localhost:${PORT}"
  # Pad URL line to fill box width
  PAD=$(printf '%*s' $((40 - ${#URL})) '')
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║   🚀  App is ready!                      ║${NC}"
  echo -e "${BOLD}${GREEN}║                                          ║${NC}"
  echo -e "${BOLD}${GREEN}║   ${URL}${PAD}║${NC}"
  echo -e "${BOLD}${GREEN}║                                          ║${NC}"
  echo -e "${BOLD}${GREEN}║   To stop:  bash setup.sh --stop         ║${NC}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
  echo ""

  # Auto-open browser (macOS / Linux / WSL)
  if command -v open &>/dev/null; then
    open "$URL"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$URL"
  fi
fi
