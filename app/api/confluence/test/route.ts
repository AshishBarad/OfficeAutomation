import { NextResponse } from "next/server";
import { readConfig, getConfluenceAuthHeader } from "@/lib/config";
import axios from "axios";

export async function GET() {
  const config = readConfig();

  if (!config.confluence.baseUrl) {
    return NextResponse.json({ success: false, error: "Confluence Base URL is not configured." }, { status: 400 });
  }

  if (!config.confluence.spaceKey) {
    return NextResponse.json({ success: false, error: "Space Key is not configured." }, { status: 400 });
  }

  const hasCredentials = config.jira.isCloud
    ? config.confluence.apiToken
    : config.jira.serverAuthMode === "pat"
    ? config.confluence.apiToken
    : config.confluence.username && config.confluence.password;

  if (!hasCredentials) {
    return NextResponse.json({ success: false, error: "Credentials are not configured." }, { status: 400 });
  }

  try {
    // Try to fetch the space — confirms URL, credentials, and space key in one shot
    const { data } = await axios.get(
      `${config.confluence.baseUrl}/rest/api/space/${config.confluence.spaceKey}`,
      {
        headers: {
          Authorization: getConfluenceAuthHeader(config),
          Accept: "application/json",
        },
      }
    );

    return NextResponse.json({
      success: true,
      space: {
        key: data.key,
        name: data.name,
        type: data.type,
      },
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 401) return NextResponse.json({ success: false, error: "401 Unauthorized — check your token or credentials." }, { status: 401 });
      if (status === 403) return NextResponse.json({ success: false, error: "403 Forbidden — no access to this space." }, { status: 403 });
      if (status === 404) return NextResponse.json({ success: false, error: `Space "${config.confluence.spaceKey}" not found, or Base URL is wrong.` }, { status: 404 });
      return NextResponse.json({ success: false, error: `HTTP ${status}: ${err.response?.statusText}` }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
