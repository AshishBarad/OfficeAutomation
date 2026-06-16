import fs from "fs";
import path from "path";
import os from "os";

// ── Config location ───────────────────────────────────────────────────────────
// Stored in the user's home directory so it survives git pull, re-clones,
// npm ci, and any other repo operation. Never inside the project folder.
const CONFIG_DIR  = path.join(os.homedir(), ".jira-automation");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

// Legacy path (inside the project) — used only for one-time migration
const LEGACY_CONFIG_PATH = path.join(process.cwd(), "config.json");

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

/** Deep-merge: fills in any missing keys from DEFAULT_CONFIG without overwriting user values */
function deepMerge(defaults: AppConfig, saved: Partial<AppConfig>): AppConfig {
  return {
    jira:       { ...defaults.jira,       ...(saved.jira       ?? {}) },
    confluence: { ...defaults.confluence, ...(saved.confluence ?? {}) },
    teams:      { ...defaults.teams,      ...(saved.teams      ?? {}) },
    alerts:     { ...defaults.alerts,     ...(saved.alerts     ?? {}) },
  } as AppConfig;
}

export function readConfig(): AppConfig {
  try {
    // One-time migration: if credentials exist in the old project-level path,
    // copy them to the permanent home-directory location and remove the old file.
    if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(LEGACY_CONFIG_PATH)) {
      try {
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.copyFileSync(LEGACY_CONFIG_PATH, CONFIG_PATH);
        // Leave the old file in place (gitignored) — don't delete it so the
        // user isn't surprised, but from now on the home-dir copy is used.
      } catch { /* ignore migration errors */ }
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      writeConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return deepMerge(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeConfig(config: AppConfig): void {
  // Ensure ~/.jira-automation/ exists before writing
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
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
