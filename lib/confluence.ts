import axios from "axios";
import { AppConfig, getConfluenceAuthHeader } from "./config";
import { JiraEpic, JiraIssue, JiraSprint } from "./jira";

function confluenceClient(config: AppConfig) {
  return axios.create({
    baseURL: config.confluence.baseUrl,
    headers: {
      Authorization: getConfluenceAuthHeader(config),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

// Format sprint date e.g. "2026-05-13T00:00:00.000Z" → "13 May 2026"
function formatDate(iso: string): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Format date for page title e.g. "27-05-2026"
function formatTitleDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("resolved") || s.includes("closed"))
    return "Green";
  if (s.includes("progress") || s.includes("review")) return "Blue";
  if (s.includes("blocked") || s.includes("impediment")) return "Red";
  return "Grey";
}

// Truncate description to ~120 chars for table
function shortDescription(desc: string | null): string {
  if (!desc) return "";
  // Jira descriptions can be Atlassian Document Format (Cloud) or plain text
  if (typeof desc === "object") {
    // ADF — extract plain text
    try {
      const adf = desc as { content?: Array<{ content?: Array<{ text?: string }> }> };
      return (
        adf.content
          ?.flatMap((b) => b.content?.map((i) => i.text || "") || [])
          .join(" ")
          .slice(0, 120) || ""
      );
    } catch {
      return "";
    }
  }
  return String(desc).slice(0, 120);
}

// Build Confluence Storage Format (XHTML) for the sprint review page
export function buildSprintReviewStorageFormat(
  sprint: JiraSprint,
  epics: JiraEpic[],
  noEpic: JiraIssue[],
  jiraBaseUrl: string
): string {
  const issueUrl = (key: string) => `${jiraBaseUrl}/browse/${key}`;

  const separator =
    '<hr style="border-top: 3px dashed #bbb; margin: 24px 0;" />';

  function issueRow(issue: JiraIssue): string {
    const color = statusColor(issue.fields.status.name);
    return `
      <tr>
        <td>
          <a href="${issueUrl(issue.key)}">${issue.key}</a> - ${escapeHtml(issue.fields.summary)}
          <br/>
          <ac:structured-macro ac:name="status">
            <ac:parameter ac:name="colour">${color}</ac:parameter>
            <ac:parameter ac:name="title">${escapeHtml(issue.fields.status.name)}</ac:parameter>
          </ac:structured-macro>
        </td>
        <td>${escapeHtml(issue.fields.status.name)}</td>
        <td>${escapeHtml(shortDescription(issue.fields.description))}</td>
        <td>${escapeHtml(issue.fields.assignee?.displayName || "Unassigned")}</td>
        <td>
          <ac:structured-macro ac:name="jira">
            <ac:parameter ac:name="server">Jira</ac:parameter>
            <ac:parameter ac:name="key">${issue.key}</ac:parameter>
          </ac:structured-macro>
        </td>
      </tr>`;
  }

  function issueTable(issues: JiraIssue[]): string {
    if (issues.length === 0) return "<p><em>No issues found.</em></p>";
    return `
      <table data-layout="wide">
        <colgroup>
          <col style="width: 220px;" />
          <col style="width: 130px;" />
          <col style="width: 280px;" />
          <col style="width: 120px;" />
          <col style="width: 300px;" />
        </colgroup>
        <tbody>
          <tr>
            <th><strong>Story in Sprint</strong></th>
            <th><strong>Status after sprint</strong></th>
            <th><strong>Comment / Description</strong></th>
            <th><strong>Assignee</strong></th>
            <th><strong>All Issues</strong></th>
          </tr>
          ${issues.map(issueRow).join("")}
        </tbody>
      </table>`;
  }

  function epicSection(epic: JiraEpic): string {
    const epicColor = statusColor(epic.status);
    return `
      ${separator}
      <h2>
        <a href="${issueUrl(epic.key)}">${escapeHtml(epic.key)}</a> - ${escapeHtml(epic.summary)}
        <ac:structured-macro ac:name="status">
          <ac:parameter ac:name="colour">${epicColor}</ac:parameter>
          <ac:parameter ac:name="title">${escapeHtml(epic.status)}</ac:parameter>
        </ac:structured-macro>
      </h2>
      ${issueTable(epic.issues)}`;
  }

  // Timetable section
  const timetable = `
    <h2>Timetable</h2>
    <table data-layout="default">
      <tbody>
        <tr>
          <th>Sprint time</th>
          <td>${formatDate(sprint.startDate)} - ${formatDate(sprint.endDate)}</td>
        </tr>
        ${sprint.goal ? `<tr><th>Sprint Goal</th><td>${escapeHtml(sprint.goal)}</td></tr>` : ""}
      </tbody>
    </table>`;

  // No-epic section (orphan issues)
  const noEpicSection =
    noEpic.length > 0
      ? `
      ${separator}
      <h2>Other Issues (No Epic)</h2>
      ${issueTable(noEpic)}`
      : "";

  return `
    ${timetable}
    ${epics.map(epicSection).join("")}
    ${noEpicSection}
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Create (or update) the sprint review page in Confluence
export async function createSprintReviewPage(
  config: AppConfig,
  sprint: JiraSprint,
  epics: JiraEpic[],
  noEpic: JiraIssue[]
): Promise<{ url: string; pageId: string; title: string }> {
  const client = confluenceClient(config);

  const endDate = formatTitleDate(sprint.endDate);
  // Extract sprint number from name if present e.g. "Skylark Sprint 5"
  const title = `${endDate} -> ${sprint.name} Review`;

  const storageContent = buildSprintReviewStorageFormat(
    sprint,
    epics,
    noEpic,
    config.jira.baseUrl
  );

  const payload = {
    type: "page",
    title,
    ancestors: config.confluence.parentPageId
      ? [{ id: config.confluence.parentPageId }]
      : undefined,
    space: { key: config.confluence.spaceKey },
    body: {
      storage: {
        value: storageContent,
        representation: "storage",
      },
    },
  };

  const { data } = await client.post(
    "/rest/api/content",
    payload
  );

  const pageUrl = `${config.confluence.baseUrl}/wiki/spaces/${config.confluence.spaceKey}/pages/${data.id}`;

  return {
    url: pageUrl,
    pageId: data.id,
    title,
  };
}

// Check if a page with the same title already exists in the space
export async function findExistingPage(
  config: AppConfig,
  title: string
): Promise<string | null> {
  const client = confluenceClient(config);
  const { data } = await client.get("/rest/api/content", {
    params: {
      title,
      spaceKey: config.confluence.spaceKey,
      expand: "version",
    },
  });
  if (data.results?.length > 0) return data.results[0].id;
  return null;
}

// Update an existing page
export async function updateSprintReviewPage(
  config: AppConfig,
  pageId: string,
  version: number,
  sprint: JiraSprint,
  epics: JiraEpic[],
  noEpic: JiraIssue[]
): Promise<{ url: string }> {
  const client = confluenceClient(config);

  const endDate = formatTitleDate(sprint.endDate);
  const title = `${endDate} -> ${sprint.name} Review`;

  const storageContent = buildSprintReviewStorageFormat(
    sprint,
    epics,
    noEpic,
    config.jira.baseUrl
  );

  await client.put(`/rest/api/content/${pageId}`, {
    version: { number: version + 1 },
    type: "page",
    title,
    body: {
      storage: {
        value: storageContent,
        representation: "storage",
      },
    },
  });

  const pageUrl = `${config.confluence.baseUrl}/wiki/spaces/${config.confluence.spaceKey}/pages/${pageId}`;
  return { url: pageUrl };
}
