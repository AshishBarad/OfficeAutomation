import { NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { sendTeamsAlert } from "@/lib/teams";
import { JiraIssue } from "@/lib/jira";
import { humanizeError } from "@/lib/api-error";

export async function POST() {
  const config = readConfig();

  const webhookUrl = config.teams.defaultWebhookUrl;
  if (!webhookUrl) {
    return NextResponse.json(
      { success: false, error: "No Teams webhook URL configured. Add one in Config → MS Teams." },
      { status: 400 }
    );
  }

  // Fake issue that looks realistic
  const fakeIssue: JiraIssue = {
    id: "999999",
    key: "TEST-001",
    fields: {
      summary: "🧪 This is a test alert from Jira Automation",
      status: { name: "Open", statusCategory: { colorName: "blue-gray" } },
      issuetype: { name: "Bug", iconUrl: "" },
      assignee: { displayName: "You", emailAddress: "you@company.com" },
      description: "If you see this in Teams, your webhook is working correctly!",
      priority: { name: "High" },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  };

  try {
    await sendTeamsAlert(webhookUrl, [fakeIssue], "Test Alert Rule", config.jira.baseUrl || "https://jira.example.com");
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const base = humanizeError(err, "MS Teams");
    // Add actionable hint for common Teams webhook failures
    const hint = base.includes("400") || base.includes("403")
      ? " Verify the webhook URL is still active in your Teams channel settings."
      : "";
    return NextResponse.json({ success: false, error: base + hint }, { status: 500 });
  }
}
