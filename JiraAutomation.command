#!/usr/bin/env bash
# ================================================================
#  Jira / Confluence Automation — Desktop Launcher
#
#  HOW TO USE:
#   1. Copy this file to your Desktop
#   2. First time only: right-click → Open  (bypasses Gatekeeper)
#   3. From then on: double-click to open the app
#
#  What it does:
#   • First run  → clones from GitHub, installs, starts the app
#   • Later runs → starts the server (or reopens browser if running)
# ================================================================

INSTALL_DIR="$HOME/Documents/jira-automation"
REPO_URL="https://github.com/AshishBarad/OfficeAutomation"

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

# ── Dependency checks ─────────────────────────────────────────────
command -v git  &>/dev/null || die "Git not found. Install via: xcode-select --install"
command -v node &>/dev/null || die "Node.js not found. Download LTS from: https://nodejs.org"
command -v npm  &>/dev/null || die "npm not found. Download Node.js from: https://nodejs.org"

# ── Install (first run only) ──────────────────────────────────────
if [ ! -d "$INSTALL_DIR/.git" ]; then
  echo -e "${YELLOW}⬇️   First run — cloning from GitHub…${NC}"
  echo ""
  git clone "$REPO_URL" "$INSTALL_DIR" \
    || die "Clone failed. Check your internet connection and try again."
  echo ""
  echo -e "${YELLOW}📦  Installing dependencies (~30 seconds)…${NC}"
  cd "$INSTALL_DIR"
  npm install --silent \
    || die "npm install failed. Check the error above."
  echo -e "${GREEN}✅  Installed successfully!${NC}"
  echo ""
else
  cd "$INSTALL_DIR"

  # ── If server is already running, just open the browser ──────────
  if [ -f ".server.pid" ] && [ -f ".server.port" ]; then
    PID=$(cat .server.pid 2>/dev/null || echo "")
    PORT=$(cat .server.port 2>/dev/null || echo "")
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null && [ -n "$PORT" ]; then
      echo -e "${GREEN}✅  App is already running on port ${PORT}${NC}"
      echo -e "    Opening ${BOLD}http://localhost:${PORT}${NC} …"
      echo ""
      open "http://localhost:${PORT}"
      echo -e "\033[2m(This window can be closed — the app keeps running in the background.)\033[0m"
      echo ""
      read -rp "Press Enter to close this window…"
      exit 0
    fi
  fi

  echo -e "${GREEN}✅  App found — starting server…${NC}"
  echo ""
fi

# ── Launch ────────────────────────────────────────────────────────
bash "$INSTALL_DIR/setup.sh"
