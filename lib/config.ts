import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "config.json");

export interface AlertRule {
  id: string;
  name: string;
  issueTypes: string[]; // e.g. ["Bug", "Story"]
  assignees: string[]; // Jira usernames or account IDs
  teamsWebhookUrl: string; // can override global webhook per rule
  enabled: boolean;
}

export type ServerAuthMode = "pat" | "basic"; // PAT = Personal Access Token, basic = username:password

export interface AppConfig {
  jira: {
    baseUrl: string;        // e.g. https://company.atlassian.net  OR  https://mydomain.com/jira
    email: string;          // Cloud only
    apiToken: string;       // Cloud API token  OR  Server PAT
    username: string;       // Server Basic auth username
    password: string;       // Server Basic auth password
    defaultProject: string;
    isCloud: boolean;       // true = Cloud, false = Server/DC
    serverAuthMode: ServerAuthMode; // Server only: "pat" or "basic"
  };
  confluence: {
    baseUrl: string;
    email: string;          // Cloud only
    apiToken: string;       // Cloud API token OR Server PAT
    username: string;       // Server Basic auth username
    password: string;       // Server Basic auth password
    spaceKey: string;
    parentPageId: string;
  };
  teams: {
    defaultWebhookUrl: string; // Incoming Webhook OR Power Automate Workflow URL
    notifyChannel: "teams" | "none"; // future: email, slack
  };
  alerts: {
    rules: AlertRule[];
    pollIntervalMinutes: number;
    lastPolledAt?: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  jira: {
    baseUrl: "",
    email: "",
    apiToken: "",
    username: "",
    password: "",
    defaultProject: "",
    isCloud: false,          // default to Server since user confirmed Server
    serverAuthMode: "pat",
  },
  confluence: {
    baseUrl: "",
    email: "",
    apiToken: "",
    username: "",
    password: "",
    spaceKey: "",
    parentPageId: "",
  },
  teams: {
    defaultWebhookUrl: "",
    notifyChannel: "teams",
  },
  alerts: {
    rules: [],
    pollIntervalMinutes: 15,
  },
};

export function readConfig(): AppConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      writeConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeConfig(config: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getJiraAuthHeader(config: AppConfig): string {
  if (config.jira.isCloud) {
    // Cloud: Basic auth with email:apiToken
    const token = Buffer.from(
      `${config.jira.email}:${config.jira.apiToken}`
    ).toString("base64");
    return `Basic ${token}`;
  }
  // Server/DC: PAT (Bearer) or Basic (username:password)
  if (config.jira.serverAuthMode === "basic") {
    const token = Buffer.from(
      `${config.jira.username}:${config.jira.password}`
    ).toString("base64");
    return `Basic ${token}`;
  }
  return `Bearer ${config.jira.apiToken}`;
}

export function getConfluenceAuthHeader(config: AppConfig): string {
  if (config.jira.isCloud) {
    const token = Buffer.from(
      `${config.confluence.email}:${config.confluence.apiToken}`
    ).toString("base64");
    return `Basic ${token}`;
  }
  // Server/DC: PAT or Basic — mirror Jira's serverAuthMode
  if (config.jira.serverAuthMode === "basic") {
    const token = Buffer.from(
      `${config.confluence.username}:${config.confluence.password}`
    ).toString("base64");
    return `Basic ${token}`;
  }
  return `Bearer ${config.confluence.apiToken}`;
}
