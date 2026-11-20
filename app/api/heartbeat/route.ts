import { recordHeartbeat } from "@/lib/server-lifecycle";

/**
 * Heartbeat endpoint — fallback kill-switch.
 *
 * The client pings this every 60 s and immediately on page mount.
 * Cancels any pending shutdown timer (from page refresh) and extends
 * the 5-minute inactivity watchdog.
 */
export async function POST() {
  recordHeartbeat();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
