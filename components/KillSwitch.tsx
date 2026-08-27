"use client";
import { useEffect } from "react";

/**
 * KillSwitch — mounts invisibly in the root layout.
 *
 * Strategy:
 *  1. `sendBeacon` on `beforeunload` — fires reliably when tab/window closes.
 *     The server receives the POST to /api/shutdown and calls process.exit(0).
 *
 *  2. Heartbeat fallback (60 s ping) — handles cases where beforeunload doesn't
 *     fire (crash, force-quit, etc.). The server allows a 5-minute gap between
 *     pings before deciding the browser is gone, which is safely above the
 *     ~1-minute throttle browsers apply to background-tab timers.
 *
 * The server does NOT start its shutdown timer until the first ping arrives,
 * so it stays alive indefinitely while you have any tab open.
 */
export default function KillSwitch() {
  useEffect(() => {
    // ── 1. Instant kill on tab/window close ────────────────────────────────
    function onUnload() {
      navigator.sendBeacon("/api/shutdown");
    }
    window.addEventListener("beforeunload", onUnload);

    // ── 2. Heartbeat fallback (60 s — survives browser background throttle) ─
    function ping() {
      fetch("/api/heartbeat", { method: "POST" }).catch(() => {/* silent */});
    }
    ping(); // immediate ping on mount
    const heartbeatId = setInterval(ping, 60_000); // 60 s — browsers throttle bg tabs to ~1 min

    return () => {
      window.removeEventListener("beforeunload", onUnload);
      clearInterval(heartbeatId);
    };
  }, []);

  return null;
}
