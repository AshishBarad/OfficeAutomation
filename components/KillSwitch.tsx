"use client";
import { useEffect } from "react";

/**
 * KillSwitch — mounts invisibly in the root layout.
 *
 * Strategy:
 *  1. `sendBeacon` on `beforeunload` — fires reliably when tab/window closes.
 *     The server receives the POST and calls process.exit(0).
 *  2. Heartbeat fallback — pings /api/heartbeat every 20 s.
 *     If the server stops receiving pings for > 35 s it also exits.
 *     This covers edge cases where beforeunload doesn't fire (crash, kill -9, etc.).
 */
export default function KillSwitch() {
  useEffect(() => {
    // ── 1. Instant kill on tab/window close ────────────────────────────────
    function onUnload() {
      navigator.sendBeacon("/api/shutdown");
    }
    window.addEventListener("beforeunload", onUnload);

    // ── 2. Heartbeat fallback ──────────────────────────────────────────────
    function ping() {
      fetch("/api/heartbeat", { method: "POST" }).catch(() => {/* silent */});
    }
    ping(); // immediate ping on mount so the server starts its timer
    const heartbeatId = setInterval(ping, 20_000);

    return () => {
      window.removeEventListener("beforeunload", onUnload);
      clearInterval(heartbeatId);
    };
  }, []);

  return null; // renders nothing
}
