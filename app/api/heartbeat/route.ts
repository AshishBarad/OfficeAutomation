/**
 * Heartbeat endpoint — fallback kill-switch.
 *
 * The client pings this every 20 s. If no ping arrives for 35 s,
 * the server assumes the browser is gone and exits cleanly.
 * This handles cases where `beforeunload` / sendBeacon doesn't fire
 * (e.g. process kill, network drop, system sleep).
 */

const TIMEOUT_MS = 35_000;
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

function resetTimer() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(() => {
    console.log("[kill-switch] Heartbeat timeout — no browser connected. Shutting down.");
    process.exit(0);
  }, TIMEOUT_MS);
}

// Start the timer immediately when this module is first imported
// (i.e. when the first request arrives after server start).
resetTimer();

export async function POST() {
  resetTimer();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
