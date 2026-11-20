/**
 * Server Lifecycle Manager
 *
 * Coordinates graceful shutdown and heartbeat timeouts.
 * Stored on globalThis to remain consistent across module re-evaluations.
 *
 * When a tab closes, beforeunload sends /api/shutdown. We allow a 3-second
 * grace period so that if the user was just refreshing the page, the new
 * page load mounts, calls /api/heartbeat or /api/temp-memory, and cancels
 * the shutdown.
 */

declare global {
  var __SHUTDOWN_TIMER__: NodeJS.Timeout | null | undefined;
  var __HEARTBEAT_TIMER__: NodeJS.Timeout | null | undefined;
}

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes inactivity fallback
const SHUTDOWN_GRACE_MS = 3_000; // 3 seconds grace for page refresh

export function scheduleShutdown(delayMs = SHUTDOWN_GRACE_MS) {
  cancelShutdown();
  globalThis.__SHUTDOWN_TIMER__ = setTimeout(() => {
    console.log("[kill-switch] Tab closed and no active tab confirmed within grace period — shutting down server.");
    process.exit(0);
  }, delayMs);
}

export function cancelShutdown() {
  if (globalThis.__SHUTDOWN_TIMER__) {
    clearTimeout(globalThis.__SHUTDOWN_TIMER__);
    globalThis.__SHUTDOWN_TIMER__ = null;
  }
}

export function recordHeartbeat() {
  cancelShutdown();
  if (globalThis.__HEARTBEAT_TIMER__) {
    clearTimeout(globalThis.__HEARTBEAT_TIMER__);
  }
  globalThis.__HEARTBEAT_TIMER__ = setTimeout(() => {
    console.log("[kill-switch] Heartbeat timeout — no browser connected for 5 min. Shutting down.");
    process.exit(0);
  }, HEARTBEAT_TIMEOUT_MS);
}
