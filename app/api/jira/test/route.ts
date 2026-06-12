import { NextResponse } from "next/server";
import { readConfig, getJiraAuthHeader } from "@/lib/config";
import axios from "axios";

export async function GET() {
  const config = readConfig();

  if (!config.jira.baseUrl) {
    return NextResponse.json({ success: false, error: "Jira Base URL is not configured." }, { status: 400 });
  }

  const hasCredentials = config.jira.isCloud
    ? config.jira.apiToken
    : config.jira.serverAuthMode === "pat"
    ? config.jira.apiToken
    : config.jira.username && config.jira.password;

  if (!hasCredentials) {
    return NextResponse.json({ success: false, error: "Credentials are not configured." }, { status: 400 });
  }

  try {
    const { data } = await axios.get(`${config.jira.baseUrl}/rest/api/2/myself`, {
      headers: {
        Authorization: getJiraAuthHeader(config),
        Accept: "application/json",
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        displayName: data.displayName,
        emailAddress: data.emailAddress,
        name: data.name,
      },
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 401) return NextResponse.json({ success: false, error: "401 Unauthorized — check your token or credentials." }, { status: 401 });
      if (status === 403) return NextResponse.json({ success: false, error: "403 Forbidden — token doesn't have permission." }, { status: 403 });
      if (status === 404) return NextResponse.json({ success: false, error: "404 — Base URL may be wrong. Could not reach /rest/api/2/myself." }, { status: 404 });
      return NextResponse.json({ success: false, error: `HTTP ${status}: ${err.response?.statusText}` }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
