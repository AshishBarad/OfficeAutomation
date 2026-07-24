/**
 * Kill-switch endpoint.
 * Called via navigator.sendBeacon when the browser tab/window closes.
 * Exits the Next.js server process so stale instances don't pile up.
 */
export async function POST() {
  // Small delay so the response can be sent before the process dies
  setTimeout(() => {
    console.log("[kill-switch] Browser tab closed — shutting down server.");
    process.exit(0);
  }, 300);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
