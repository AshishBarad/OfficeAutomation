# ⚡ Jira / Confluence Automation

A web app to automate Jira & Confluence workflows and keep your team in sync via MS Teams.

| Feature | Description |
|---|---|
| **Sprint Review** | Enter a Sprint ID → generates a full Confluence sprint review page (epics as headings, user stories in tables) |
| **Teams Alerts** | Watch rules that send MS Teams notifications when Jira tickets are created or assigned |
| **Config** | Browser-based settings page for all credentials — stored locally, never sent anywhere |

---

## 🚀 One-command setup

```bash
git clone https://github.com/AshishBarad/OfficeAutomation.git && cd OfficeAutomation && bash setup.sh
```

That's it. The script will:
1. Check Node.js is installed (v18+)
2. Install dependencies
3. Create a blank `config.json`
4. Build and start the server
5. Open `http://localhost:3000` in your browser

---

## Prerequisites

- **Node.js v18 or later** — download from [nodejs.org](https://nodejs.org)
- Access to your Jira / Confluence instance
- (Optional) MS Teams webhook URL for alerts

---

## Usage

| Command | What it does |
|---|---|
| `bash setup.sh` | Install, build, and start (production) |
| `bash setup.sh --dev` | Start in dev mode with hot reload |
| `bash setup.sh --stop` | Stop the background server |

### Starting again after first setup

```bash
bash setup.sh
```

The script detects that `node_modules` already exists and skips the install step, so subsequent starts are fast.

---

## Configuration

On first run, open **http://localhost:3000/config** and fill in:

### Jira
| Field | Value |
|---|---|
| Instance type | **Server / DC** (custom domain) or **Cloud** (`*.atlassian.net`) |
| Base URL | `https://mydomain.com/jira` — no trailing slash |
| Auth method | **PAT** (Personal Access Token) — Jira Profile → Personal Access Tokens |
| | **Username & Password** — if your Jira version is older than 8.14 |
| Default Project | e.g. `NWAP` |

### Confluence
| Field | Value |
|---|---|
| Base URL | `https://mydomain.com/confluence` |
| Space Key | e.g. `EADRAX` — found in Space Settings |
| Parent Page ID | Number from the URL of your sprint review parent page: `/pages/{id}/` |

### MS Teams (optional)
Two options to get a webhook URL:
- **Power Automate (recommended):** Teams channel → `···` → Workflows → search "Post to a channel when a webhook request is received" → copy HTTP POST URL
- **Legacy Incoming Webhook:** Teams channel → `···` → Connectors → Incoming Webhook *(deprecated by Microsoft in 2024)*

---

## How to use

### Sprint Review
1. Go to **Sprint Review** in the sidebar
2. Enter your **Sprint ID** (from Jira board URL: `?sprintId=42`)
3. Click **Fetch Sprint** — preview the data
4. Click **Create Confluence Page** — page is created under your configured parent page

### Teams Alerts
1. Go to **Teams Alerts** → **New Rule**
2. Pick issue types (Bug, Story, etc.) and assignees to watch
3. Click **Test Alert** to verify your webhook is working
4. Use **Poll Now** to trigger a manual check, or let it run on the configured interval

---

## Security

- Credentials are stored in `config.json` on your local machine only
- `config.json` is in `.gitignore` — it is never committed to this repo
- All Jira/Confluence API calls happen server-side (Next.js API routes) — tokens never reach the browser
