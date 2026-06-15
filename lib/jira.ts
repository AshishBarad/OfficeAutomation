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
    customfield_10014?: string; // Epic Link (Server)
    customfield_10008?: string; // Epic Link (older Server)
    priority?: { name: string };
    resolution?: { name: string } | null;
    duedate?: string | null;
    created: string;
    updated: string;
    // Story points — field name varies by instance
    customfield_10016?: number | null;
    customfield_10028?: number | null;
    customfield_10004?: number | null;
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

// Extract story points from an issue — tries all known custom field names
export function getStoryPoints(issue: JiraIssue): number {
  return Number(
    issue.fields.customfield_10016 ??
    issue.fields.customfield_10028 ??
    issue.fields.customfield_10004 ??
    0
  ) || 0;
}

// True if the issue is considered "done" for capacity purposes
function isDone(issue: JiraIssue): boolean {
  const s = issue.fields.status.name.toLowerCase();
  return s === "done" || s === "resolved" || s === "closed" || s === "won't fix";
}

// True if the issue is a defect/bug type
export function isDefect(issue: JiraIssue): boolean {
  const t = issue.fields.issuetype.name.toLowerCase();
  return t.includes("bug") || t.includes("defect");
}

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

// Fetch sprint metadata
export async function getSprint(
  config: AppConfig,
  sprintId: string
): Promise<JiraSprint> {
  const client = jiraClient(config);
  const { data } = await client.get(`/rest/agile/1.0/sprint/${sprintId}`);
  return data;
}

// Fetch all issues in a sprint (handles pagination)
export async function getSprintIssues(
  config: AppConfig,
  sprintId: string
): Promise<JiraIssue[]> {
  const client = jiraClient(config);
  const allIssues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const { data } = await client.get(
      `/rest/agile/1.0/sprint/${sprintId}/issue`,
      {
        params: {
          startAt,
          maxResults,
          fields: [
            "summary", "status", "issuetype", "assignee", "reporter",
            "description", "parent",
            "customfield_10014", "customfield_10008", // Epic Link
            "customfield_10016", "customfield_10028", "customfield_10004", // Story Points
            "priority", "resolution", "duedate", "created", "updated",
          ].join(","),
        },
      }
    );
    allIssues.push(...data.issues);
    if (allIssues.length >= data.total) break;
    startAt += maxResults;
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

// Compute capacity for a single sprint from its issues
function calcCapacity(sprintMeta: JiraSprint, issues: JiraIssue[]): SprintCapacity {
  const nonEpicIssues = issues.filter(
    (i) => i.fields.issuetype.name !== "Epic"
  );
  const plannedPoints = nonEpicIssues.reduce(
    (sum, i) => sum + getStoryPoints(i), 0
  );
  const deliveredPoints = nonEpicIssues
    .filter(isDone)
    .reduce((sum, i) => sum + getStoryPoints(i), 0);
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

// Fetch capacity history: current sprint + last N closed sprints from same board
export async function getCapacityHistory(
  config: AppConfig,
  currentSprint: JiraSprint,
  currentIssues: JiraIssue[],
  historyCount = 5
): Promise<SprintCapacity[]> {
  const client = jiraClient(config);

  // Capacity for the sprint being reviewed
  const currentCapacity = calcCapacity(currentSprint, currentIssues);

  // Try to get historical sprints from the same board
  const boardId = currentSprint.originBoardId;
  if (!boardId) return [currentCapacity];

  let pastSprints: JiraSprint[] = [];
  try {
    const { data } = await client.get(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      {
        params: {
          state: "closed",
          maxResults: historyCount + 1, // fetch one extra in case current is included
        },
      }
    );
    // Exclude the current sprint and take the most recent N
    pastSprints = (data.values as JiraSprint[])
      .filter((s) => s.id !== currentSprint.id)
      .slice(-historyCount)
      .reverse(); // most recent first
  } catch {
    // Board access may be restricted — just return current sprint only
    return [currentCapacity];
  }

  // Fetch issues for each past sprint (lightweight: only story points + status)
  const pastCapacities = await Promise.all(
    pastSprints.map(async (sprint) => {
      try {
        const issues = await getSprintIssues(config, String(sprint.id));
        return calcCapacity(sprint, issues);
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

  // Return oldest → newest, with current sprint last
  return [...pastCapacities.reverse(), currentCapacity];
}

// Group sprint issues by epic + collect defects + compute capacity
export async function getSprintReviewData(
  config: AppConfig,
  sprintId: string
): Promise<{
  sprint: JiraSprint;
  epics: JiraEpic[];
  noEpic: JiraIssue[];
  defects: JiraIssue[];
  capacityHistory: SprintCapacity[];
}> {
  const [sprint, issues] = await Promise.all([
    getSprint(config, sprintId),
    getSprintIssues(config, sprintId),
  ]);

  const epicMap = new Map<string, JiraIssue[]>();
  const noEpic: JiraIssue[] = [];
  const defects: JiraIssue[] = [];

  for (const issue of issues) {
    if (issue.fields.issuetype.name === "Epic") continue;

    // Collect defects separately (they also appear under their epic below)
    if (isDefect(issue)) defects.push(issue);

    const epicKey =
      issue.fields.parent?.key ||
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

  // Capacity history (best-effort)
  const capacityHistory = await getCapacityHistory(config, sprint, issues);

  return { sprint, epics, noEpic, defects, capacityHistory };
}

// Search for new issues since a given time — used for Teams alerts polling
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
