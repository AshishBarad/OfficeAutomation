import { NextResponse } from "next/server";
import { readConfig, writeConfig } from "@/lib/config";
import { searchNewIssues } from "@/lib/jira";
import { sendTeamsAlert } from "@/lib/teams";

// POST — trigger a manual poll or called by the built-in scheduler
export async function POST() {
  const config = readConfig();

  if (!config.jira.baseUrl || !config.jira.apiToken) {
    return NextResponse.json(
      { success: false, error: "Jira not configured" },
      { status: 400 }
    );
  }

  const enabledRules = config.alerts.rules.filter((r) => r.enabled);
  if (enabledRules.length === 0) {
    return NextResponse.json({ success: true, message: "No enabled rules", alerts: [] });
  }

  // Use last polled time or default to 60 minutes ago
  const since = config.alerts.lastPolledAt
    ? config.alerts.lastPolledAt
    : new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const results: Array<{
    rule: string;
    issuesFound: number;
    error?: string;
  }> = [];

  for (const rule of enabledRules) {
    try {
      const issues = await searchNewIssues(
        config,
        {
          issueTypes: rule.issueTypes,
          assignees: rule.assignees,
          project: config.jira.defaultProject,
        },
        since
      );

      if (issues.length > 0) {
        const webhookUrl =
          rule.teamsWebhookUrl || config.teams.defaultWebhookUrl;
        if (webhookUrl) {
          await sendTeamsAlert(
            webhookUrl,
            issues,
            rule.name,
            config.jira.baseUrl
          );
        }
        results.push({ rule: rule.name, issuesFound: issues.length });
      } else {
        results.push({ rule: rule.name, issuesFound: 0 });
      }
    } catch (err) {
      results.push({
        rule: rule.name,
        issuesFound: 0,
        error: String(err),
      });
    }
  }

  // Update last polled time
  config.alerts.lastPolledAt = new Date().toISOString();
  writeConfig(config);

  return NextResponse.json({ success: true, since, results });
}
