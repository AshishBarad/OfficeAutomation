import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, AppConfig } from "@/lib/config";

export async function GET() {
  try {
    const config = readConfig();
    // Mask tokens for display
    const masked = {
      ...config,
      jira: {
        ...config.jira,
        apiToken: config.jira.apiToken ? "••••••••" : "",
        password: config.jira.password ? "••••••••" : "",
      },
      confluence: {
        ...config.confluence,
        apiToken: config.confluence.apiToken ? "••••••••" : "",
        password: config.confluence.password ? "••••••••" : "",
      },
      teams: {
        ...config.teams,
        defaultWebhookUrl: config.teams.defaultWebhookUrl
          ? config.teams.defaultWebhookUrl.slice(0, 40) + "…"
          : "",
      },
    };
    return NextResponse.json({ success: true, config: masked });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const existing = readConfig();

    // Merge — keep existing tokens if masked values are sent back
    const merged: AppConfig = {
      ...existing,
      jira: {
        ...existing.jira,
        ...body.jira,
        // Keep existing secret if masked placeholder was sent back
        apiToken:
          body.jira?.apiToken && !body.jira.apiToken.includes("•")
            ? body.jira.apiToken
            : existing.jira.apiToken,
        password:
          body.jira?.password && !body.jira.password.includes("•")
            ? body.jira.password
            : existing.jira.password,
      },
      confluence: {
        ...existing.confluence,
        ...body.confluence,
        apiToken:
          body.confluence?.apiToken && !body.confluence.apiToken.includes("•")
            ? body.confluence.apiToken
            : existing.confluence.apiToken,
        password:
          body.confluence?.password && !body.confluence.password.includes("•")
            ? body.confluence.password
            : existing.confluence.password,
      },
      teams: {
        ...existing.teams,
        ...body.teams,
        defaultWebhookUrl:
          body.teams?.defaultWebhookUrl &&
          !body.teams.defaultWebhookUrl.includes("…")
            ? body.teams.defaultWebhookUrl
            : existing.teams.defaultWebhookUrl,
      },
      alerts: body.alerts || existing.alerts,
    };

    writeConfig(merged);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
