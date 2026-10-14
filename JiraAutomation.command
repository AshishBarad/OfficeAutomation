#!/usr/bin/env bash
# ================================================================
#  Jira / Confluence Automation — Desktop Launcher
#
#  HOW TO USE:
#   1. First time only: right-click → Open  (bypasses Gatekeeper)
#   2. From then on: double-click to open the app
#
#  Runs directly from: ~/Desktop/OfficeAutomation
# ================================================================

APP_DIR="$HOME/Desktop/OfficeAutomation"
PLIST_LABEL="com.officeautomation.server"
PLIST_FILE="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

# ── Colours ──────────────────────────────────────────────────────
BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

die() {
  printf "${RED}❌  %s${NC}\n\n" "$*"
  read -rp "Press Enter to close…"
  exit 1
}

clear
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   ⚡  Jira / Confluence Automation       ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Sanity check ─────────────────────────────────────────────────
[ -d "$APP_DIR" ] || die "App folder not found at: $APP_DIR"
command -v node &>/dev/null || die "Node.js not found. Download LTS from: https://nodejs.org"
command -v npm  &>/dev/null || die "npm not found. Download Node.js from: https://nodejs.org"

cd "$APP_DIR"

# ── Install node_modules if missing ──────────────────────────────
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦  First run — installing dependencies (~30 seconds)…${NC}"
  npm install --silent || die "npm install failed. Check the error above."
  echo -e "${GREEN}✅  Installed successfully!${NC}"
  echo ""
fi

# ── Stop any previously registered launchd service ───────────────
if launchctl list "$PLIST_LABEL" &>/dev/null 2>&1; then
  echo -e "${CYAN}🔄  Stopping previous service…${NC}"
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  sleep 1
fi

# ── Kill any existing server on the target port ───────────────────
if [ -f ".server.pid" ]; then
  OLD_PID=$(cat .server.pid 2>/dev/null || echo "")
  [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null || true
fi

# ── Build (production) ───────────────────────────────────────────
echo -e "${CYAN}🔨  Building app…${NC}"
npm run build --silent || die "Build failed. Check the error above."
echo -e "${GREEN}✅  Build complete.${NC}"
echo ""

# ── Start server ─────────────────────────────────────────────────
echo -e "${CYAN}🚀  Starting server…${NC}"
nohup npm start > /tmp/jira-automation.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > .server.pid

# Read the port from package.json start script (default 3333)
PORT=$(grep -o '"next start --port [0-9]*"' package.json | grep -o '[0-9]*' || echo "3333")
echo "$PORT" > .server.port

# Wait for server to be ready (up to 15s)
echo -ne "${CYAN}⏳  Waiting for server"
for i in $(seq 1 30); do
  if curl -s "http://localhost:${PORT}" -o /dev/null 2>/dev/null; then
    break
  fi
  echo -n "."
  sleep 0.5
done
echo ""

if curl -s "http://localhost:${PORT}" -o /dev/null 2>/dev/null; then
  echo -e "${GREEN}✅  App is running on port ${PORT}${NC}"
  echo -e "    Opening ${BOLD}http://localhost:${PORT}${NC} …"
  echo ""
  open "http://localhost:${PORT}"
  echo -e "\033[2m(This window can be closed — the app keeps running in the background.)\033[0m"
  echo ""
  read -rp "Press Enter to close this window…"
else
  echo -e "${RED}❌  Server did not respond on port ${PORT}. Check /tmp/jira-automation.log for errors.${NC}"
  read -rp "Press Enter to close…"
  exit 1
fi
