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
NC='\033[0m' # No Colour

# ── Helpers ──────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶  $*${NC}"; }

PIDFILE=".server.pid"
PORT=3000
DEV_MODE=false

# ── Parse flags ──────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --dev)  DEV_MODE=true ;;
    --stop) stop_server; exit 0 ;;
  esac
done

stop_server() {
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      rm -f "$PIDFILE"
      success "Server stopped (PID $PID)"
    else
      warn "No running server found for PID $PID"
      rm -f "$PIDFILE"
    fi
  else
    # Try killing by port as fallback
    PORTPID=$(lsof -ti tcp:$PORT 2>/dev/null || true)
    if [ -n "$PORTPID" ]; then
      kill "$PORTPID"
      success "Stopped process on port $PORT"
    else
      warn "No server running on port $PORT"
    fi
  fi
}

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
  info "node_modules already present — running npm ci for clean install"
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
    cp config.example.json config.json
    warn "Created config.json from template — open http://localhost:${PORT}/config to fill in your credentials"
  else
    # Create a minimal blank config so the app starts without crashing
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
    warn "Created blank config.json — open http://localhost:${PORT}/config to fill in your credentials"
  fi
else
  success "config.json exists"
fi

# ── Step 4: Kill any existing server on the port ─────────────
EXISTING=$(lsof -ti tcp:$PORT 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  warn "Port $PORT in use — stopping existing process..."
  kill "$EXISTING" 2>/dev/null || true
  sleep 1
fi

# ── Step 5: Build + Start ────────────────────────────────────
if [ "$DEV_MODE" = true ]; then
  step "Starting in development mode (hot reload)"
  info "Press Ctrl+C to stop"
  echo ""
  npm run dev
else
  step "Building for production"
  info "Building optimised bundle..."
  npm run build --silent

  step "Starting production server"
  # Run in background and save PID
  npm start -- --port $PORT &
  SERVER_PID=$!
  echo $SERVER_PID > "$PIDFILE"

  # Wait until the server is actually up (up to 15s)
  echo -ne "${BLUE}ℹ${NC}  Waiting for server"
  for i in $(seq 1 30); do
    if curl -s "http://localhost:${PORT}" -o /dev/null 2>/dev/null; then
      break
    fi
    echo -n "."
    sleep 0.5
  done
  echo ""

  success "Server running (PID $SERVER_PID)"

  # ── Open browser ───────────────────────────────────────────
  URL="http://localhost:${PORT}"
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║   🚀  App is ready!                      ║${NC}"
  echo -e "${BOLD}${GREEN}║                                          ║${NC}"
  echo -e "${BOLD}${GREEN}║   ${URL}                   ║${NC}"
  echo -e "${BOLD}${GREEN}║                                          ║${NC}"
  echo -e "${BOLD}${GREEN}║   To stop:  bash setup.sh --stop         ║${NC}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
  echo ""

  # Auto-open browser on macOS / Linux / WSL
  if command -v open &>/dev/null; then
    open "$URL"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$URL"
  fi
fi
