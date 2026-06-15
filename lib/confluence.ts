import axios from "axios";
import { AppConfig, getConfluenceAuthHeader } from "./config";
import { JiraEpic, JiraIssue, JiraSprint, SprintCapacity, getStoryPoints } from "./jira";

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

function formatDate(iso: string): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatTitleDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("resolved") || s.includes("closed") || s.includes("won't fix"))
    return "Green";
  if (s.includes("progress") || s.includes("review")) return "Blue";
  if (s.includes("blocked") || s.includes("impediment")) return "Red";
  return "Grey";
}

function priorityColor(priority: string | undefined): string {
  if (!priority) return "Grey";
  const p = priority.toLowerCase();
  if (p === "critical" || p === "blocker") return "Red";
  if (p === "high" || p === "major") return "Yellow";
  if (p === "medium" || p === "normal") return "Blue";
  return "Grey";
}

function shortDescription(desc: string | null): string {
  if (!desc) return "";
  if (typeof desc === "object") {
    try {
      const adf = desc as { content?: Array<{ content?: Array<{ text?: string }> }> };
      return adf.content
        ?.flatMap((b) => b.content?.map((i) => i.text || "") || [])
        .join(" ").slice(0, 120) || "";
    } catch { return ""; }
  }
  return String(desc).slice(0, 120);
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildTimetable(sprint: JiraSprint): string {
  return `
    <h2>Timetable</h2>
    <table data-layout="default">
      <tbody>
        <tr>
          <th><strong>Sprint time</strong></th>
          <td>${formatDate(sprint.startDate)} &nbsp;–&nbsp; ${formatDate(sprint.endDate)}</td>
        </tr>
        ${sprint.goal ? `<tr><th><strong>Sprint Goal</strong></th><td>${escapeHtml(sprint.goal)}</td></tr>` : ""}
      </tbody>
    </table>`;
}

function buildEpicsSection(
  epics: JiraEpic[],
  noEpic: JiraIssue[],
  issueUrl: (key: string) => string
): string {
  const separator = '<hr style="border-top: 3px dashed #bbb; margin: 24px 0;" />';

  function storyRow(issue: JiraIssue): string {
    const color = statusColor(issue.fields.status.name);
    const pts = getStoryPoints(issue);
    return `
      <tr>
        <td>
          <a href="${issueUrl(issue.key)}">${issue.key}</a><br/>
          <span>${escapeHtml(issue.fields.summary)}</span><br/>
          <ac:structured-macro ac:name="status">
            <ac:parameter ac:name="colour">${color}</ac:parameter>
            <ac:parameter ac:name="title">${escapeHtml(issue.fields.status.name)}</ac:parameter>
          </ac:structured-macro>
        </td>
        <td>${escapeHtml(issue.fields.status.name)}</td>
        <td>${escapeHtml(shortDescription(issue.fields.description))}</td>
        <td>${escapeHtml(issue.fields.assignee?.displayName || "Unassigned")}</td>
        <td style="text-align:center;">${pts > 0 ? pts : "—"}</td>
        <td>
          <ac:structured-macro ac:name="jira">
            <ac:parameter ac:name="server">Jira</ac:parameter>
            <ac:parameter ac:name="key">${issue.key}</ac:parameter>
          </ac:structured-macro>
        </td>
      </tr>`;
  }

  function storyTable(issues: JiraIssue[]): string {
    if (issues.length === 0) return "<p><em>No issues found.</em></p>";
    return `
      <table data-layout="wide">
        <colgroup>
          <col style="width: 220px;" /><col style="width: 120px;" />
          <col style="width: 250px;" /><col style="width: 120px;" />
          <col style="width: 60px;" /><col style="width: 280px;" />
        </colgroup>
        <tbody>
          <tr>
            <th><strong>Story in Sprint</strong></th>
            <th><strong>Status after sprint</strong></th>
            <th><strong>Comment / Description</strong></th>
            <th><strong>Assignee</strong></th>
            <th><strong>SP</strong></th>
            <th><strong>All Issues</strong></th>
          </tr>
          ${issues.map(storyRow).join("")}
        </tbody>
      </table>`;
  }

  const epicSections = epics.map((epic) => {
    const color = statusColor(epic.status);
    return `
      ${separator}
      <h2>
        <a href="${issueUrl(epic.key)}">${escapeHtml(epic.key)}</a> – ${escapeHtml(epic.summary)}&nbsp;
        <ac:structured-macro ac:name="status">
          <ac:parameter ac:name="colour">${color}</ac:parameter>
          <ac:parameter ac:name="title">${escapeHtml(epic.status)}</ac:parameter>
        </ac:structured-macro>
      </h2>
      ${storyTable(epic.issues)}`;
  }).join("");

  const noEpicSection = noEpic.length > 0
    ? `${separator}<h2>Other Issues (No Epic)</h2>${storyTable(noEpic)}`
    : "";

  return epicSections + noEpicSection;
}

function buildDefectsSection(
  defects: JiraIssue[],
  issueUrl: (key: string) => string
): string {
  if (defects.length === 0) {
    return `
      <h2>Defects</h2>
      <p><em>No defects found in this sprint. 🎉</em></p>`;
  }

  const rows = defects.map((issue) => {
    const statusCol = statusColor(issue.fields.status.name);
    const priColor = priorityColor(issue.fields.priority?.name);
    return `
      <tr>
        <td><a href="${issueUrl(issue.key)}">${issue.key}</a></td>
        <td>${escapeHtml(issue.fields.summary)}</td>
        <td>${escapeHtml(issue.fields.issuetype.name)}</td>
        <td>${formatDateShort(issue.fields.created)}</td>
        <td>${formatDateShort(issue.fields.updated)}</td>
        <td>${formatDateShort(issue.fields.duedate)}</td>
        <td>${escapeHtml(issue.fields.assignee?.displayName || "—")}</td>
        <td>${escapeHtml(issue.fields.reporter?.displayName || "—")}</td>
        <td>
          <ac:structured-macro ac:name="status">
            <ac:parameter ac:name="colour">${priColor}</ac:parameter>
            <ac:parameter ac:name="title">${escapeHtml(issue.fields.priority?.name || "—")}</ac:parameter>
          </ac:structured-macro>
        </td>
        <td>
          <ac:structured-macro ac:name="status">
            <ac:parameter ac:name="colour">${statusCol}</ac:parameter>
            <ac:parameter ac:name="title">${escapeHtml(issue.fields.status.name)}</ac:parameter>
          </ac:structured-macro>
        </td>
        <td>${escapeHtml(issue.fields.resolution?.name || "Unresolved")}</td>
      </tr>`;
  }).join("");

  return `
    <h2>Defects</h2>
    <table data-layout="full-width">
      <colgroup>
        <col style="width: 110px;" /><col style="width: 220px;" />
        <col style="width: 80px;" /><col style="width: 120px;" />
        <col style="width: 120px;" /><col style="width: 100px;" />
        <col style="width: 130px;" /><col style="width: 130px;" />
        <col style="width: 80px;" /><col style="width: 100px;" />
        <col style="width: 100px;" />
      </colgroup>
      <tbody>
        <tr>
          <th><strong>Key</strong></th>
          <th><strong>Summary</strong></th>
          <th><strong>Type</strong></th>
          <th><strong>Created</strong></th>
          <th><strong>Updated</strong></th>
          <th><strong>Due</strong></th>
          <th><strong>Assignee</strong></th>
          <th><strong>Reporter</strong></th>
          <th><strong>Priority</strong></th>
          <th><strong>Status</strong></th>
          <th><strong>Resolution</strong></th>
        </tr>
        ${rows}
      </tbody>
    </table>`;
}

function buildCapacitySection(capacityHistory: SprintCapacity[]): string {
  const rows = capacityHistory.map((c) => `
    <tr>
      <td>${escapeHtml(c.sprintName)}</td>
      <td style="text-align:center;">${c.plannedPoints > 0 ? c.plannedPoints : "—"}</td>
      <td style="text-align:center;">${c.deliveredPoints > 0 ? c.deliveredPoints : "—"}</td>
      <td style="text-align:center;">
        ${c.completionRatio !== "N/A" ? `
          <ac:structured-macro ac:name="status">
            <ac:parameter ac:name="colour">${completionColor(c.completionRatio)}</ac:parameter>
            <ac:parameter ac:name="title">${c.completionRatio}</ac:parameter>
          </ac:structured-macro>` : "—"}
      </td>
    </tr>`).join("");

  return `
    <h2>Sprint Report</h2>
    <h3>Completion Ratio</h3>
    <table data-layout="default">
      <colgroup>
        <col style="width: 200px;" /><col style="width: 140px;" />
        <col style="width: 140px;" /><col style="width: 120px;" />
      </colgroup>
      <tbody>
        <tr>
          <th></th>
          <th><strong>Planned Capacity (SP)</strong></th>
          <th><strong>Delivered Velocity (SP)</strong></th>
          <th><strong>Completion Ratio</strong></th>
        </tr>
        ${rows}
      </tbody>
    </table>`;
}

function completionColor(ratio: string): string {
  const n = parseInt(ratio);
  if (isNaN(n)) return "Grey";
  if (n >= 80) return "Green";
  if (n >= 60) return "Yellow";
  return "Red";
}

// ── Main page builder ─────────────────────────────────────────────────────────

export function buildSprintReviewStorageFormat(
  sprint: JiraSprint,
  epics: JiraEpic[],
  noEpic: JiraIssue[],
  defects: JiraIssue[],
  capacityHistory: SprintCapacity[],
  jiraBaseUrl: string
): string {
  const issueUrl = (key: string) => `${jiraBaseUrl}/browse/${key}`;
  const sep = '<hr style="border-top: 2px solid #ddd; margin: 32px 0;" />';

  return `
    ${buildTimetable(sprint)}
    ${buildEpicsSection(epics, noEpic, issueUrl)}
    ${sep}
    ${buildDefectsSection(defects, issueUrl)}
    ${sep}
    ${buildCapacitySection(capacityHistory)}
  `;
}

// ── Confluence API calls ──────────────────────────────────────────────────────

export async function createSprintReviewPage(
  config: AppConfig,
  sprint: JiraSprint,
  epics: JiraEpic[],
  noEpic: JiraIssue[],
  defects: JiraIssue[],
  capacityHistory: SprintCapacity[]
): Promise<{ url: string; pageId: string; title: string }> {
  const client = confluenceClient(config);
  const title = `${formatTitleDate(sprint.endDate)} -> ${sprint.name} Review`;

  const storageContent = buildSprintReviewStorageFormat(
    sprint, epics, noEpic, defects, capacityHistory, config.jira.baseUrl
  );

  const { data } = await client.post("/rest/api/content", {
    type: "page",
    title,
    ancestors: config.confluence.parentPageId
      ? [{ id: config.confluence.parentPageId }]
      : undefined,
    space: { key: config.confluence.spaceKey },
    body: { storage: { value: storageContent, representation: "storage" } },
  });

  return {
    url: `${config.confluence.baseUrl}/wiki/spaces/${config.confluence.spaceKey}/pages/${data.id}`,
    pageId: data.id,
    title,
  };
}

export async function findExistingPage(
  config: AppConfig,
  title: string
): Promise<string | null> {
  const client = confluenceClient(config);
  const { data } = await client.get("/rest/api/content", {
    params: { title, spaceKey: config.confluence.spaceKey, expand: "version" },
  });
  return data.results?.length > 0 ? data.results[0].id : null;
}

export async function updateSprintReviewPage(
  config: AppConfig,
  pageId: string,
  version: number,
  sprint: JiraSprint,
  epics: JiraEpic[],
  noEpic: JiraIssue[],
  defects: JiraIssue[],
  capacityHistory: SprintCapacity[]
): Promise<{ url: string }> {
  const client = confluenceClient(config);
  const title = `${formatTitleDate(sprint.endDate)} -> ${sprint.name} Review`;

  await client.put(`/rest/api/content/${pageId}`, {
    version: { number: version + 1 },
    type: "page",
    title,
    body: {
      storage: {
        value: buildSprintReviewStorageFormat(
          sprint, epics, noEpic, defects, capacityHistory, config.jira.baseUrl
        ),
        representation: "storage",
      },
    },
  });

  return {
    url: `${config.confluence.baseUrl}/wiki/spaces/${config.confluence.spaceKey}/pages/${pageId}`,
  };
}
