/**
 * Heartbeat endpoint — fallback kill-switch.
 *
 * The client pings this every 60 s. Browsers throttle background-tab timers
 * to ~1 min, so the server timeout must be significantly larger than that.
 * We use 5 minutes (300 s) — this means the server stays alive as long as
 * the browser has the tab open (even in the background), and shuts down
 * ~5 min after the tab/browser is actually closed.
 */

const TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

function resetTimer() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(() => {
    console.log("[kill-switch] Heartbeat timeout — no browser connected for 5 min. Shutting down.");
    process.exit(0);
  }, TIMEOUT_MS);
}

// Timer starts on first heartbeat POST (not on module import),
// so the server won't exit before any browser has ever connected.
export async function POST() {
  resetTimer();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
