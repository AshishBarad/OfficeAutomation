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
    parent?: { key: string; fields: { summary: string; issuetype?: { name: string } } };
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
    // Sprint report completion status (set for closed sprints only)
    _completionStatus?: "completed" | "not-completed" | "removed";
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

export interface JiraStory {
  issue: JiraIssue;
  subIssues: JiraIssue[]; // tasks / subtasks under this story
}

export interface JiraEpic {
  key: string;
  summary: string;
  status: string;
  stories: JiraStory[];      // stories, each carrying their sub-tasks
  orphanIssues: JiraIssue[]; // sprint issues with no story parent
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
  extraFields: string[] = [],
  projectKeyOverride?: string
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

  // projectKeyOverride === undefined → fall back to config.jira.defaultProject
  // projectKeyOverride === "" → no filter, fetch all tickets
  // projectKeyOverride === "NWAP" → filter to NWAP-* only
  const projectKey =
    projectKeyOverride !== undefined
      ? projectKeyOverride.trim().toUpperCase()
      : config.jira.defaultProject?.trim().toUpperCase() ?? "";

  if (projectKey) {
    return allIssues.filter((i) =>
      i.key.toUpperCase().startsWith(`${projectKey}-`)
    );
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
  spFieldId?: string | null,
  projectKeyOverride?: string
): Promise<JiraIssue[]> {
  const client = jiraClient(config);

  // Same semantics: undefined → config default, "" → no filter, "PROJ" → filter
  const projectKey =
    projectKeyOverride !== undefined
      ? projectKeyOverride.trim()
      : config.jira.defaultProject?.trim() ?? "";
  const projectClause = projectKey ? ` AND project = "${projectKey}"` : "";
  const jql = `issuetype in (Defect, Bug) AND Sprint = ${sprintId}${projectClause} ORDER BY created DESC`;

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
    return [];
  }
}

/**
 * For closed sprints: call the Sprint Report to get the COMPLETE list of issue keys
 * (completed + not-completed + removed from sprint). The Agile sprint-issues endpoint
 * only returns the final state; the sprint report is the authoritative source.
 * Returns an array of { key, completionStatus } for every issue that ever touched the sprint.
 */
async function getSprintReportData(
  config: AppConfig,
  sprint: JiraSprint
): Promise<{ key: string; completionStatus: "completed" | "not-completed" | "removed" }[]> {
  if (!sprint.originBoardId) return [];
  try {
    const client = jiraClient(config);
    const { data } = await client.get(
      "/rest/greenhopper/1.0/rapid/charts/sprintreport",
      { params: { rapidViewId: sprint.originBoardId, sprintId: sprint.id } }
    );
    const result: { key: string; completionStatus: "completed" | "not-completed" | "removed" }[] = [];
    for (const i of (data.contents?.completedIssues ?? []))
      result.push({ key: i.key, completionStatus: "completed" });
    for (const i of (data.contents?.issuesNotCompletedInCurrentSprint ?? []))
      result.push({ key: i.key, completionStatus: "not-completed" });
    for (const i of (data.contents?.puntedIssues ?? []))
      result.push({ key: i.key, completionStatus: "removed" });
    return result;
  } catch {
    // Sprint report API not available — fall back to Agile sprint issues API
    return [];
  }
}

/**
 * Fetch full issue details for a specific list of keys via JQL.
 * Batches 50 keys at a time to stay within URL limits.
 */
async function fetchIssuesByKeys(
  config: AppConfig,
  keys: string[],
  extraFields: string[] = []
): Promise<JiraIssue[]> {
  if (keys.length === 0) return [];
  const client = jiraClient(config);
  const baseFields = [
    "summary", "status", "issuetype", "assignee", "reporter",
    "description", "parent",
    "customfield_10014", "customfield_10008",
    "customfield_10016", "customfield_10028", "customfield_10004",
    "priority", "resolution", "duedate", "created", "updated",
  ];
  const fieldList = [...new Set([...baseFields, ...extraFields])].join(",");

  const allIssues: JiraIssue[] = [];
  // Batch in groups of 50 to avoid JQL length limits
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const jql = `key in (${batch.join(",")}) ORDER BY created DESC`;
    try {
      const { data } = await client.get("/rest/api/2/search", {
        params: { jql, maxResults: 50, fields: fieldList },
      });
      allIssues.push(...(data.issues || []));
    } catch {
      // skip failed batch silently
    }
  }
  return allIssues;
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
  sprintId: string,
  projectKeyOverride?: string
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

  const [sprint, agileSideIssues] = await Promise.all([
    getSprint(config, sprintId),
    getSprintIssues(config, sprintId, extraFields, projectKeyOverride),
  ]);

  let issues: JiraIssue[] = agileSideIssues;

  // For closed sprints: the Agile sprint-issues endpoint only returns issues that
  // survived to the sprint's final state. The Sprint Report is the authoritative
  // source — it includes completed, not-completed, AND removed/punted issues.
  if (sprint.state === "closed") {
    const reportItems = await getSprintReportData(config, sprint);
    if (reportItems.length > 0) {
      // Build completion status map
      const completionMap = new Map(reportItems.map(i => [i.key, i.completionStatus]));

      // Fetch full issue details for all keys from the sprint report
      const allReportKeys = reportItems.map(i => i.key);
      const reportIssues = await fetchIssuesByKeys(config, allReportKeys, extraFields);

      // Apply project filter (same logic as getSprintIssues)
      const projectKey =
        projectKeyOverride !== undefined
          ? projectKeyOverride.trim().toUpperCase()
          : config.jira.defaultProject?.trim().toUpperCase() ?? "";
      const filteredIssues = projectKey
        ? reportIssues.filter(i => i.key.toUpperCase().startsWith(`${projectKey}-`))
        : reportIssues;

      // Augment each issue with its sprint-report completion status
      for (const issue of filteredIssues) {
        const status = completionMap.get(issue.key);
        if (status) issue.fields._completionStatus = status;
      }

      issues = filteredIssues;
    }
    // If sprint report returned nothing (API unavailable), keep agileSideIssues
  }

  // Index all sprint issues by key for parent-chain resolution
  const issueByKey = new Map<string, JiraIssue>();
  for (const issue of issues) issueByKey.set(issue.key, issue);

  // Helper: walk up parent chain to find the ultimate Epic key
  function resolveEpicKey(issue: JiraIssue, depth = 0): string | null {
    if (depth > 5) return null; // guard against cycles
    const parentType = issue.fields.parent?.fields?.issuetype?.name?.toLowerCase();
    const parentKey  = issue.fields.parent?.key;

    if (parentType === "epic") return parentKey || null;

    // Explicit epic-link custom fields
    const epicLinkVal = epicLinkFieldId
      ? (issue.fields[epicLinkFieldId] as string | undefined)
      : undefined;
    if (epicLinkVal) return epicLinkVal;
    if (issue.fields.customfield_10014) return issue.fields.customfield_10014;
    if (issue.fields.customfield_10008) return issue.fields.customfield_10008;

    // Parent is a Story in the sprint — recurse to find its epic
    if (parentKey && issueByKey.has(parentKey)) {
      return resolveEpicKey(issueByKey.get(parentKey)!, depth + 1);
    }
    return null;
  }

  const epicStoryMap  = new Map<string, JiraIssue[]>();
  const storyTaskMap  = new Map<string, JiraIssue[]>();
  const noEpic: JiraIssue[] = [];

  for (const issue of issues) {
    if (issue.fields.issuetype.name === "Epic") continue;

    const parentKey  = issue.fields.parent?.key;
    const parentType = issue.fields.parent?.fields?.issuetype?.name?.toLowerCase();

    const directEpicParent = parentType === "epic";
    const storyParentInSprint = parentKey && issueByKey.has(parentKey) && !directEpicParent;

    if (directEpicParent && parentKey) {
      if (!epicStoryMap.has(parentKey)) epicStoryMap.set(parentKey, []);
      epicStoryMap.get(parentKey)!.push(issue);
    } else if (storyParentInSprint && parentKey) {
      if (!storyTaskMap.has(parentKey)) storyTaskMap.set(parentKey, []);
      storyTaskMap.get(parentKey)!.push(issue);
    } else {
      const epicKey = resolveEpicKey(issue);
      if (epicKey) {
        if (!epicStoryMap.has(epicKey)) epicStoryMap.set(epicKey, []);
        epicStoryMap.get(epicKey)!.push(issue);
      } else {
        noEpic.push(issue);
      }
    }
  }

  const epicKeyList = Array.from(epicStoryMap.keys());
  const epicDetails = await Promise.all(
    epicKeyList.map((key) =>
      getEpic(config, key).catch(() => ({ key, summary: key, status: "Unknown" }))
    )
  );

  const epics: JiraEpic[] = epicDetails.map((epic) => {
    const storyIssues = epicStoryMap.get(epic.key) || [];
    const stories: JiraStory[] = storyIssues.map((storyIssue) => ({
      issue: storyIssue,
      subIssues: storyTaskMap.get(storyIssue.key) || [],
    }));
    return {
      key: epic.key,
      summary: epic.summary,
      status: epic.status,
      stories,
      orphanIssues: [],
    };
  });

  const defects = await getDefectsByJQL(config, sprintId, storyPointsFieldId, projectKeyOverride);

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
