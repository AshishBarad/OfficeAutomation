import { scheduleShutdown } from "@/lib/server-lifecycle";

/**
 * Kill-switch endpoint.
 * Called via navigator.sendBeacon when the browser tab/window closes.
 * Exits the Next.js server process after a 3-second grace period so page
 * refreshes have time to reload and cancel the shutdown.
 */
export async function POST() {
  scheduleShutdown(3000);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
