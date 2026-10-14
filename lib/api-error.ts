import axios from "axios";

/**
 * Translates an unknown caught error into a clear, human-readable message.
 *
 * Priority:
 *  1. Axios HTTP errors  → map known status codes to actionable messages
 *  2. Network/DNS errors → explain the likely root cause
 *  3. Generic Error      → use .message
 *  4. Anything else      → String()
 */
export function humanizeError(err: unknown, context?: string): string {
  const ctx = context ? `[${context}] ` : "";

  if (axios.isAxiosError(err)) {
    const status  = err.response?.status;
    const details = err.response?.data;

    // Extract a useful sub-message from the Jira/Confluence JSON response body
    const serverMsg: string =
      (typeof details === "object" && details !== null)
        ? (details.message ?? details.errorMessages?.[0] ?? details.error ?? "")
        : typeof details === "string"
        ? details.slice(0, 200)
        : "";

    const suffix = serverMsg ? ` — ${serverMsg}` : "";

    if (!err.response) {
      // Network-level error (no response received)
      const code = err.code;
      if (code === "ECONNREFUSED")
        return `${ctx}Could not connect to the server. Is the Jira/Confluence Base URL correct and reachable?`;
      if (code === "ENOTFOUND" || code === "EAI_AGAIN")
        return `${ctx}Hostname not found. Check the Base URL — it may be misspelled or unreachable from this machine.`;
      if (code === "ETIMEDOUT" || code === "ECONNABORTED")
        return `${ctx}Request timed out. The server took too long to respond. Try again or check VPN/network.`;
      return `${ctx}Network error (${code ?? "unknown"}): ${err.message}`;
    }

    switch (status) {
      case 400:
        return `${ctx}Bad request (400)${suffix}. Check the Sprint ID and your configuration.`;
      case 401:
        return `${ctx}Authentication failed (401). Your API token, PAT, or username/password is incorrect or expired. Go to Config to update credentials.`;
      case 403:
        return `${ctx}Access denied (403). Your account does not have permission to access this resource${suffix}.`;
      case 404:
        return `${ctx}Not found (404). The Sprint ID, board, or space key may be wrong${suffix}.`;
      case 407:
        return `${ctx}Proxy authentication required (407). Check your network/VPN/proxy settings.`;
      case 429:
        return `${ctx}Rate limit exceeded (429). Too many requests — wait a moment and try again.`;
      case 500:
      case 502:
      case 503:
      case 504:
        return `${ctx}Server error (${status}). The Jira/Confluence server is having issues. Try again later${suffix}.`;
      default:
        return `${ctx}HTTP ${status ?? "unknown"}: ${err.response?.statusText ?? err.message}${suffix}`;
    }
  }

  if (err instanceof Error) {
    return `${ctx}${err.message}`;
  }

  return `${ctx}${String(err)}`;
}
