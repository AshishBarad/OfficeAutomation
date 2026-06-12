import axios from "axios";
import { JiraIssue } from "./jira";

// Detect whether this is a Power Automate Workflow URL or an old Connector URL
// Power Automate URLs contain "logic.azure.com" or "prod-XX.westeurope.logic.azure.com"
// Old connector URLs contain "outlook.office.com/webhook" or "office365connector"
function isPowerAutomateUrl(url: string): boolean {
  return url.includes("logic.azure.com") || url.includes("make.powerautomate.com");
}

// Send an alert to a Teams channel via Incoming Webhook or Power Automate Workflow
export async function sendTeamsAlert(
  webhookUrl: string,
  issues: JiraIssue[],
  ruleName: string,
  jiraBaseUrl: string
): Promise<void> {
  if (!webhookUrl || issues.length === 0) return;

  for (const issue of issues) {
    const issueUrl = `${jiraBaseUrl}/browse/${issue.key}`;
    const assignee = issue.fields.assignee?.displayName || "Unassigned";
    const priority = issue.fields.priority?.name || "N/A";
    const status = issue.fields.status?.name || "N/A";
    const emoji = getEmoji(issue.fields.issuetype.name);

    if (isPowerAutomateUrl(webhookUrl)) {
      // Power Automate "Post to a channel when a webhook request is received"
      // expects a plain JSON body — the flow maps fields to the Teams message
      const payload = {
        title: `${emoji} New ${issue.fields.issuetype.name}: ${issue.key}`,
        text: issue.fields.summary,
        details: `**Rule:** ${ruleName} | **Assignee:** ${assignee} | **Status:** ${status} | **Priority:** ${priority}`,
        url: issueUrl,
        key: issue.key,
        issueType: issue.fields.issuetype.name,
        assignee,
        status,
        priority,
        ruleName,
        created: new Date(issue.fields.created).toLocaleString(),
      };
      await axios.post(webhookUrl, payload);
    } else {
      // Legacy Office 365 Connector / Incoming Webhook — MessageCard format
      const card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: getThemeColor(issue.fields.issuetype.name),
        summary: `New ${issue.fields.issuetype.name}: ${issue.key}`,
        sections: [
          {
            activityTitle: `${emoji} **[${issue.fields.issuetype.name}] ${issue.key}**`,
            activitySubtitle: `Alert rule: **${ruleName}**`,
            activityText: issue.fields.summary,
            facts: [
              { name: "Assignee", value: assignee },
              { name: "Status", value: status },
              { name: "Priority", value: priority },
              { name: "Created", value: new Date(issue.fields.created).toLocaleString() },
            ],
          },
        ],
        potentialAction: [
          {
            "@type": "OpenUri",
            name: "View in Jira",
            targets: [{ os: "default", uri: issueUrl }],
          },
        ],
      };
      await axios.post(webhookUrl, card);
    }
  }
}

function getThemeColor(issueType: string): string {
  const t = issueType.toLowerCase();
  if (t.includes("bug")) return "FF0000";
  if (t.includes("epic")) return "800080";
  if (t.includes("story")) return "0052CC";
  if (t.includes("task")) return "00B050";
  return "0078D4";
}

function getEmoji(issueType: string): string {
  const t = issueType.toLowerCase();
  if (t.includes("bug")) return "🐛";
  if (t.includes("epic")) return "⚡";
  if (t.includes("story")) return "📖";
  if (t.includes("task")) return "✅";
  return "🎫";
}
