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
    description: string | null;
    // Jira Cloud uses "parent" for epics; Server uses "customfield_10014"
    parent?: { key: string; fields: { summary: string } };
    customfield_10014?: string; // Epic Link (Server)
    customfield_10008?: string; // Epic Link (older Server)
    priority?: { name: string };
    created: string;
    updated: string;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate: string;
  endDate: string;
  goal?: string;
  boardId?: number;
}

export interface JiraEpic {
  key: string;
  summary: string;
  status: string;
  issues: JiraIssue[];
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
          fields:
            "summary,status,issuetype,assignee,description,parent,customfield_10014,customfield_10008,priority,created,updated",
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

// Group sprint issues by epic, return structured data for sprint review
export async function getSprintReviewData(
  config: AppConfig,
  sprintId: string
): Promise<{ sprint: JiraSprint; epics: JiraEpic[]; noEpic: JiraIssue[] }> {
  const [sprint, issues] = await Promise.all([
    getSprint(config, sprintId),
    getSprintIssues(config, sprintId),
  ]);

  const epicMap = new Map<string, JiraIssue[]>();
  const noEpic: JiraIssue[] = [];

  for (const issue of issues) {
    // Skip epics themselves — only group stories/tasks/bugs
    if (issue.fields.issuetype.name === "Epic") continue;

    const epicKey =
      issue.fields.parent?.key || // Cloud: parent epic
      issue.fields.customfield_10014 || // Server: Epic Link
      issue.fields.customfield_10008 || // Server: older Epic Link
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
      getEpic(config, key).catch(() => ({
        key,
        summary: key,
        status: "Unknown",
      }))
    )
  );

  const epics: JiraEpic[] = epicDetails.map((epic) => ({
    key: epic.key,
    summary: epic.summary,
    status: epic.status,
    issues: epicMap.get(epic.key) || [],
  }));

  return { sprint, epics, noEpic };
}

// Search for new issues since a given time — used for Teams alerts polling
export async function searchNewIssues(
  config: AppConfig,
  rule: {
    issueTypes: string[];
    assignees: string[];
    project?: string;
  },
  since: string // ISO date string
): Promise<JiraIssue[]> {
  const client = jiraClient(config);

  const issueTypeJql = rule.issueTypes
    .map((t) => `"${t}"`)
    .join(", ");
  const assigneeJql = rule.assignees
    .map((a) => `"${a}"`)
    .join(", ");

  let jql = `created >= "${since}" AND issuetype in (${issueTypeJql})`;
  if (rule.assignees.length > 0) {
    jql += ` AND assignee in (${assigneeJql})`;
  }
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

// Get list of projects (for dropdowns)
export async function getProjects(config: AppConfig) {
  const client = jiraClient(config);
  const { data } = await client.get("/rest/api/2/project");
  return data;
}

// Get list of issue types
export async function getIssueTypes(config: AppConfig) {
  const client = jiraClient(config);
  const { data } = await client.get("/rest/api/2/issuetype");
  return data;
}
