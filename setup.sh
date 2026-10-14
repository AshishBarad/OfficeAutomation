#!/usr/bin/env bash
# ============================================================
#  Jira / Confluence Automation — One-click setup & launcher
#  Usage:
#    First time:        bash setup.sh
#    Next time:         bash setup.sh          (skips install, just starts)
#    Dev mode:          bash setup.sh --dev
#    Stop server:       bash setup.sh --stop
#    Install service:   bash setup.sh --install-service
#    Uninstall service: bash setup.sh --uninstall-service
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

# ── launchd service constants ─────────────────────────────────
PLIST_LABEL="com.officeautomation.server"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

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
# Handles both launchd-managed and legacy bare-process servers.
stop_server() {
  # Prefer launchd bootout if the service is registered
  if launchctl list "$PLIST_LABEL" &>/dev/null 2>&1; then
    info "Stopping launchd service…"
    launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
    rm -f "$PLIST_PATH" "$PIDFILE" "$PORTFILE"
    success "Service stopped and unregistered from launchd"
    info "The server will NOT auto-restart. Run setup.sh to start again."
    return
  fi
  # Fallback: legacy PID-file kill
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
    warn "No running server found (neither launchd service nor .server.pid)"
  fi
}

# ── Install launchd service ───────────────────────────────────
# Writes a LaunchAgent plist and bootstraps it for the current
# user session. The server will auto-start at login and survive
# sleep/wake cycles.
install_service() {
  local install_dir
  install_dir="$(pwd)"
  local wrapper="${install_dir}/launchd-wrapper.sh"

  if [ ! -f "$wrapper" ]; then
    error "launchd-wrapper.sh not found in ${install_dir}. Cannot install service."
  fi
  chmod +x "$wrapper"

  mkdir -p "$HOME/Library/LaunchAgents"

  # Write the plist (heredoc avoids quoting issues)
  cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Unique service name registered with launchd -->
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <!-- Run launchd-wrapper.sh which picks a port and exec's npm start -->
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${wrapper}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${install_dir}</string>

    <!-- Start when the user logs in -->
    <key>RunAtLoad</key>
    <true/>

    <!-- Restart automatically if the server crashes or the machine wakes from sleep -->
    <key>KeepAlive</key>
    <true/>

    <!-- Redirect stdout/stderr to log files for debugging -->
    <key>StandardOutPath</key>
    <string>${install_dir}/.server.log</string>
    <key>StandardErrorPath</key>
    <string>${install_dir}/.server.error.log</string>

    <!-- Provide a sensible PATH since launchd has a minimal environment -->
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
PLIST

  # Unload any previous version first so the plist changes take effect
  if launchctl list "$PLIST_LABEL" &>/dev/null 2>&1; then
    info "Previous service found — reloading…"
    launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
    sleep 1
  fi

  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  success "launchd service registered: ${PLIST_LABEL}"
  success "The server now auto-starts on login and restarts after sleep/wake."
}

# ── Uninstall launchd service ─────────────────────────────────
uninstall_service() {
  if launchctl list "$PLIST_LABEL" &>/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
    success "launchd service stopped"
  else
    warn "Service was not running in launchd"
  fi

  if [ -f "$PLIST_PATH" ]; then
    rm -f "$PLIST_PATH"
    success "Plist removed: ${PLIST_PATH}"
  else
    warn "Plist not found — may already be uninstalled"
  fi

  rm -f "$PIDFILE" "$PORTFILE"
  success "Service fully uninstalled"
}

# ── Parse flags ──────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --dev)               DEV_MODE=true ;;
    --stop)              stop_server;       exit 0 ;;
    --install-service)   install_service;   exit 0 ;;
    --uninstall-service) uninstall_service; exit 0 ;;
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

# Credentials are stored in ~/.jira-automation/config.json (outside the repo)
# so git pull / re-clones can never overwrite them.
CONFIG_STORE="$HOME/.jira-automation/config.json"

if [ -f "$CONFIG_STORE" ]; then
  success "Credentials found at ~/.jira-automation/config.json"
else
  warn "No credentials yet — open the app and go to the Config page to set them up"
  info "They will be saved to: $CONFIG_STORE"
fi

# ── Step 4: Build + Start ────────────────────────────────────
if [ "$DEV_MODE" = true ]; then
  step "Finding available port"
  PORT=$(find_free_port)
  success "Using port $PORT"

  step "Starting in development mode (hot reload)"
  info "Port: $PORT  —  Press Ctrl+C to stop"
  echo ""
  npm run dev -- --port "$PORT"
else
  step "Building for production"
  info "Building optimised bundle..."
  npm run build --silent

  step "Registering system service (launchd)"
  install_service

  # Wait for the wrapper to write the port file and the server to respond
  echo -ne "${BLUE}ℹ${NC}  Waiting for server"
  PORT=""
  for i in $(seq 1 60); do
    # Read port once it's been written by the wrapper
    if [ -z "$PORT" ] && [ -f "$PORTFILE" ]; then
      PORT=$(cat "$PORTFILE" 2>/dev/null || echo "")
    fi
    if [ -n "$PORT" ] && curl -s "http://localhost:${PORT}" -o /dev/null 2>/dev/null; then
      break
    fi
    echo -n "."
    sleep 0.5
  done
  echo ""

  if [ -z "$PORT" ]; then
    warn "Server did not respond in time. Check .server.error.log for details."
    warn "Try: tail -f $(pwd)/.server.error.log"
    exit 1
  fi

  success "Server running on port $PORT"
  success "It will auto-restart after sleep/wake and survive laptop lock."

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
