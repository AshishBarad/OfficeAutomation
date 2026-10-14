#!/usr/bin/env bash
# ============================================================
#  launchd-wrapper.sh  —  Executed by launchd to start the server
#
#  launchd has a minimal PATH and no shell rc files, so we:
#   1. Extend PATH to cover Homebrew (both Intel & Apple Silicon)
#      and nvm-managed Node installs.
#   2. Reuse the last known port if it's still free, otherwise
#      pick a new one from 3100-3999.
#   3. Write the chosen port to .server.port so other scripts
#      (JiraAutomation.command) can find the server.
#   4. exec npm start so launchd tracks the correct PID and
#      KeepAlive/restart works properly after sleep/wake.
# ============================================================

# ── Resolve install directory from this script's location ────
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INSTALL_DIR"

PORTFILE="$INSTALL_DIR/.server.port"

# ── Extend PATH so node/npm are discoverable ─────────────────
# Homebrew (Apple Silicon)
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
# Homebrew (Intel Mac)
[ -d "/usr/local/bin" ]    && export PATH="/usr/local/bin:$PATH"
# nvm-managed Node (most common location)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" --no-use
# fnm (another popular Node version manager)
if command -v fnm &>/dev/null; then eval "$(fnm env)"; fi

# ── Verify npm is available ───────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found. PATH=$PATH" >&2
  exit 1
fi

# ── Pick a port ───────────────────────────────────────────────
# Try to reuse the last known port if it's still free.
LAST_PORT=$(cat "$PORTFILE" 2>/dev/null || echo "")
PORT=""

if [ -n "$LAST_PORT" ] && ! lsof -iTCP:"$LAST_PORT" -sTCP:LISTEN -t &>/dev/null 2>&1; then
  PORT="$LAST_PORT"
else
  for p in $(seq 3100 3999); do
    if ! lsof -iTCP:"$p" -sTCP:LISTEN -t &>/dev/null 2>&1; then
      PORT="$p"
      break
    fi
  done
fi

if [ -z "$PORT" ]; then
  echo "ERROR: Could not find a free port in range 3100-3999." >&2
  exit 1
fi

echo "$PORT" > "$PORTFILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting server on port $PORT (node: $(node -v 2>/dev/null))"

# ── Start the server ──────────────────────────────────────────
# exec replaces this shell process with npm so launchd monitors
# the correct PID and KeepAlive restarts it properly.
exec npm start -- --port "$PORT"
