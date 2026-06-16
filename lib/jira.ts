import axios from "axios";
import { AppConfig, getJiraAuthHeader } from "./config";

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { colorName: string } };
    issuetype: { name: string; iconUrl: string };
    assignee: { displayName: string; emailAddress: string } | null;
    reporter?: { displayName: string; emailAddress: string } | null;
    description: string | null;
    // Epic link fields
    parent?: { key: string; fields: { summary: string } };
    customfield_10014?: string; // Epic Link (Server fallback)
    customfield_10008?: string; // Epic Link (older Server fallback)
    priority?: { name: string };
    resolution?: { name: string } | null;
    duedate?: string | null;
    created: string;
    updated: string;
    // Story points — field name varies by instance (fallbacks)
    customfield_10016?: number | null;
    customfield_10028?: number | null;
    customfield_10004?: number | null;
    // Allow dynamic custom field access for instance-specific fields
    [key: string]: unknown;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate: string;
  endDate: string;
  goal?: string;
  originBoardId?: number;
}

export interface JiraEpic {
  key: string;
  summary: string;
  status: string;
  issues: JiraIssue[];
}

export interface SprintCapacity {
  sprintId: number;
  sprintName: string;
  plannedPoints: number;
  deliveredPoints: number;
  completionRatio: string; // e.g. "72%"
}

export interface JiraFieldMeta {
  epicLinkFieldId: string | null;
  storyPointsFieldId: string | null;
}

// ── Field discovery ───────────────────────────────────────────────────────────

/**
 * Fetches all Jira field definitions and returns the custom field IDs for
 * "Epic Link" and "Story Points" as used by this specific Jira instance.
 * Fails gracefully — returns nulls if the API call fails.
 */
export async function discoverJiraFields(config: AppConfig): Promise<JiraFieldMeta> {
  try {
    const client = jiraClient(config);
    const { data } = await client.get("/rest/api/2/field");
    let epicLinkFieldId: string | null = null;
    let storyPointsFieldId: string | null = null;

    for (const field of data as Array<{ id: string; name: string }>) {
      const name = field.name.toLowerCase();
      if (name === "epic link" && !epicLinkFieldId) {
        epicLinkFieldId = field.id;
      }
      if (
        (name === "story points" || name === "story point estimate") &&
        !storyPointsFieldId
      ) {
        storyPointsFieldId = field.id;
      }
    }
    return { epicLinkFieldId, storyPointsFieldId };
  } catch {
    return { epicLinkFieldId: null, storyPointsFieldId: null };
  }
}

// ── Story points helpers ──────────────────────────────────────────────────────

/**
 * Extract story points from an issue.
 * Tries the discovered field ID first, then well-known fallback field names.
 */
export function getStoryPoints(issue: JiraIssue, spFieldId?: string | null): number {
  if (spFieldId) {
    const val = Number(issue.fields[spFieldId]);
    if (!isNaN(val) && val > 0) return val;
  }
  return (
    Number(
      issue.fields.customfield_10016 ??
      issue.fields.customfield_10028 ??
      issue.fields.customfield_10004 ??
      0
    ) || 0
  );
}

// True if the issue is considered "done" for capacity purposes
function isDone(issue: JiraIssue): boolean {
  const s = issue.fields.status.name.toLowerCase();
  return (
    s === "done" ||
    s === "resolved" ||
    s === "closed" ||
    s === "won't fix" ||
    s === "wont fix"
  );
}

// True if the issue is a defect/bug type (used for web UI preview)
export function isDefect(issue: JiraIssue): boolean {
  const t = issue.fields.issuetype.name.toLowerCase();
  return t.includes("bug") || t.includes("defect");
}

// ── Jira client ───────────────────────────────────────────────────────────────

function jiraClient(config: AppConfig) {
  return axios.create({
    baseURL: config.jira.baseUrl,
    headers: {
      Authorization: getJiraAuthHeader(config),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

// ── Sprint data fetchers ──────────────────────────────────────────────────────

export async function getSprint(
  config: AppConfig,
  sprintId: string
): Promise<JiraSprint> {
  const client = jiraClient(config);
  const { data } = await client.get(`/rest/agile/1.0/sprint/${sprintId}`);
  return data;
}

/**
 * Fetch all issues in a sprint (handles pagination).
 * extraFields: additional custom field IDs to include (e.g. discovered epic link / SP fields).
 */
export async function getSprintIssues(
  config: AppConfig,
  sprintId: string,
  extraFields: string[] = []
): Promise<JiraIssue[]> {
  const client = jiraClient(config);
  const allIssues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 50;

  const baseFields = [
    "summary", "status", "issuetype", "assignee", "reporter",
    "description", "parent",
    "customfield_10014", "customfield_10008", // Epic Link fallbacks
    "customfield_10016", "customfield_10028", "customfield_10004", // Story Points fallbacks
    "priority", "resolution", "duedate", "created", "updated",
  ];
  const fieldList = [...new Set([...baseFields, ...extraFields])].join(",");

  while (true) {
    const { data } = await client.get(
      `/rest/agile/1.0/sprint/${sprintId}/issue`,
      { params: { startAt, maxResults, fields: fieldList } }
    );
    allIssues.push(...data.issues);
    if (allIssues.length >= data.total) break;
    startAt += maxResults;
  }

  return allIssues;
}

/**
 * Fetch defects for a sprint via JQL — more reliable than filtering from sprint
 * issues since some Jira configurations exclude certain issue types from sprint views.
 */
export async function getDefectsByJQL(
  config: AppConfig,
  sprintId: string,
  spFieldId?: string | null
): Promise<JiraIssue[]> {
  const client = jiraClient(config);
  const jql = `issuetype in (Defect, Bug) AND Sprint = ${sprintId} ORDER BY created DESC`;
  const fields = [
    "summary", "status", "issuetype", "assignee", "reporter",
    "priority", "resolution", "duedate", "created", "updated",
    "customfield_10016", "customfield_10028", "customfield_10004",
    ...(spFieldId ? [spFieldId] : []),
  ];
  try {
    const { data } = await client.get("/rest/api/2/search", {
      params: {
        jql,
        maxResults: 200,
        fields: [...new Set(fields)].join(","),
      },
    });
    return data.issues || [];
  } catch {
    // Fallback: no defects (permission issue or no Defect issuetype)
    return [];
  }
}

// Fetch epic details by key
export async function getEpic(
  config: AppConfig,
  epicKey: string
): Promise<{ key: string; summary: string; status: string }> {
  const client = jiraClient(config);
  const { data } = await client.get(`/rest/api/2/issue/${epicKey}`, {
    params: { fields: "summary,status" },
  });
  return {
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status.name,
  };
}

// ── Capacity ──────────────────────────────────────────────────────────────────

function calcCapacity(
  sprintMeta: JiraSprint,
  issues: JiraIssue[],
  spFieldId?: string | null
): SprintCapacity {
  const nonEpicIssues = issues.filter(
    (i) => i.fields.issuetype.name !== "Epic"
  );
  const plannedPoints = nonEpicIssues.reduce(
    (sum, i) => sum + getStoryPoints(i, spFieldId),
    0
  );
  const deliveredPoints = nonEpicIssues
    .filter(isDone)
    .reduce((sum, i) => sum + getStoryPoints(i, spFieldId), 0);
  const ratio =
    plannedPoints > 0
      ? Math.round((deliveredPoints / plannedPoints) * 100) + "%"
      : "N/A";

  return {
    sprintId: sprintMeta.id,
    sprintName: sprintMeta.name,
    plannedPoints,
    deliveredPoints,
    completionRatio: ratio,
  };
}

export async function getCapacityHistory(
  config: AppConfig,
  currentSprint: JiraSprint,
  currentIssues: JiraIssue[],
  historyCount = 5,
  spFieldId?: string | null
): Promise<SprintCapacity[]> {
  const client = jiraClient(config);
  const currentCapacity = calcCapacity(currentSprint, currentIssues, spFieldId);

  const boardId = currentSprint.originBoardId;
  if (!boardId) return [currentCapacity];

  let pastSprints: JiraSprint[] = [];
  try {
    const { data } = await client.get(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      { params: { state: "closed", maxResults: historyCount + 1 } }
    );
    pastSprints = (data.values as JiraSprint[])
      .filter((s) => s.id !== currentSprint.id)
      .slice(-historyCount)
      .reverse();
  } catch {
    return [currentCapacity];
  }

  const pastCapacities = await Promise.all(
    pastSprints.map(async (sprint) => {
      try {
        const extraFields = spFieldId ? [spFieldId] : [];
        const issues = await getSprintIssues(config, String(sprint.id), extraFields);
        return calcCapacity(sprint, issues, spFieldId);
      } catch {
        return {
          sprintId: sprint.id,
          sprintName: sprint.name,
          plannedPoints: 0,
          deliveredPoints: 0,
          completionRatio: "N/A",
        };
      }
    })
  );

  return [...pastCapacities.reverse(), currentCapacity];
}

// ── Main aggregator ───────────────────────────────────────────────────────────

export async function getSprintReviewData(
  config: AppConfig,
  sprintId: string
): Promise<{
  sprint: JiraSprint;
  epics: JiraEpic[];
  noEpic: JiraIssue[];
  defects: JiraIssue[];
  capacityHistory: SprintCapacity[];
  storyPointsFieldId: string | null;
}> {
  // Discover which custom fields carry "Epic Link" and "Story Points" in this instance
  const { epicLinkFieldId, storyPointsFieldId } = await discoverJiraFields(config);

  const extraFields = [epicLinkFieldId, storyPointsFieldId].filter(
    Boolean
  ) as string[];

  const [sprint, issues] = await Promise.all([
    getSprint(config, sprintId),
    getSprintIssues(config, sprintId, extraFields),
  ]);

  const epicMap = new Map<string, JiraIssue[]>();
  const noEpic: JiraIssue[] = [];

  for (const issue of issues) {
    if (issue.fields.issuetype.name === "Epic") continue;

    // Try to find epic key: parent hierarchy → discovered epic link field → fallback fields
    const epicKey: string | null =
      issue.fields.parent?.key ||
      (epicLinkFieldId
        ? (issue.fields[epicLinkFieldId] as string | undefined) || null
        : null) ||
      issue.fields.customfield_10014 ||
      issue.fields.customfield_10008 ||
      null;

    if (epicKey) {
      if (!epicMap.has(epicKey)) epicMap.set(epicKey, []);
      epicMap.get(epicKey)!.push(issue);
    } else {
      noEpic.push(issue);
    }
  }

  // Fetch epic details in parallel
  const epicKeys = Array.from(epicMap.keys());
  const epicDetails = await Promise.all(
    epicKeys.map((key) =>
      getEpic(config, key).catch(() => ({ key, summary: key, status: "Unknown" }))
    )
  );

  const epics: JiraEpic[] = epicDetails.map((epic) => ({
    key: epic.key,
    summary: epic.summary,
    status: epic.status,
    issues: epicMap.get(epic.key) || [],
  }));

  // Fetch defects via dedicated JQL (more reliable than filtering sprint issues)
  const defects = await getDefectsByJQL(config, sprintId, storyPointsFieldId);

  // Capacity: current sprint + last N closed sprints from same board
  const capacityHistory = await getCapacityHistory(
    config,
    sprint,
    issues,
    5,
    storyPointsFieldId
  );

  return { sprint, epics, noEpic, defects, capacityHistory, storyPointsFieldId };
}

// ── Alert helpers ─────────────────────────────────────────────────────────────

export async function searchNewIssues(
  config: AppConfig,
  rule: { issueTypes: string[]; assignees: string[]; project?: string },
  since: string
): Promise<JiraIssue[]> {
  const client = jiraClient(config);

  const issueTypeJql = rule.issueTypes.map((t) => `"${t}"`).join(", ");
  const assigneeJql = rule.assignees.map((a) => `"${a}"`).join(", ");

  let jql = `created >= "${since}" AND issuetype in (${issueTypeJql})`;
  if (rule.assignees.length > 0) jql += ` AND assignee in (${assigneeJql})`;
  if (rule.project || config.jira.defaultProject) {
    jql += ` AND project = "${rule.project || config.jira.defaultProject}"`;
  }
  jql += " ORDER BY created DESC";

  const { data } = await client.get("/rest/api/2/search", {
    params: {
      jql,
      maxResults: 50,
      fields: "summary,status,issuetype,assignee,priority,created",
    },
  });

  return data.issues || [];
}

export async function getProjects(config: AppConfig) {
  const client = jiraClient(config);
  const { data } = await client.get("/rest/api/2/project");
  return data;
}

export async function getIssueTypes(config: AppConfig) {
  const client = jiraClient(config);
  const { data } = await client.get("/rest/api/2/issuetype");
  return data;
}
