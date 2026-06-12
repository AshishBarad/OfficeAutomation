"use client";
import { useEffect, useState } from "react";
import {
  Save, Eye, EyeOff, CheckCircle, AlertCircle,
  Loader2, Info, Wifi, WifiOff,
} from "lucide-react";

type ServerAuthMode = "pat" | "basic";

type JiraConfig = {
  baseUrl: string; email: string; apiToken: string;
  username: string; password: string;
  defaultProject: string; isCloud: boolean; serverAuthMode: ServerAuthMode;
};
type ConfluenceConfig = {
  baseUrl: string; email: string; apiToken: string;
  username: string; password: string;
  spaceKey: string; parentPageId: string;
};
type TeamsConfig = { defaultWebhookUrl: string; notifyChannel: "teams" | "none" };
type AlertsConfig = { pollIntervalMinutes: number };

type ConnStatus = "idle" | "testing" | "ok" | "error";
type ConnResult = { status: ConnStatus; message: string };

const EMPTY_JIRA: JiraConfig = {
  baseUrl: "", email: "", apiToken: "", username: "", password: "",
  defaultProject: "", isCloud: false, serverAuthMode: "pat",
};
const EMPTY_CONF: ConfluenceConfig = {
  baseUrl: "", email: "", apiToken: "", username: "", password: "",
  spaceKey: "", parentPageId: "",
};

const POLL_OPTIONS = [
  { value: 5,   label: "5 minutes" },
  { value: 10,  label: "10 minutes" },
  { value: 15,  label: "15 minutes" },
  { value: 30,  label: "30 minutes" },
  { value: 60,  label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 360, label: "6 hours" },
];

// ── Validation helpers ────────────────────────────────────────────────────────
function validateJira(jira: JiraConfig): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!jira.baseUrl.trim()) errors.baseUrl = "Base URL is required.";
  else if (!/^https?:\/\//.test(jira.baseUrl)) errors.baseUrl = "Must start with http:// or https://";
  else if (jira.baseUrl.endsWith("/")) errors.baseUrl = "Remove the trailing slash.";

  if (jira.isCloud && !jira.email.trim()) errors.email = "Email is required for Cloud.";
  if (jira.serverAuthMode === "pat" || jira.isCloud) {
    if (!jira.apiToken.trim() || jira.apiToken.includes("•")) errors.apiToken = "API / Personal Access Token is required.";
  }
  if (!jira.isCloud && jira.serverAuthMode === "basic") {
    if (!jira.username.trim()) errors.username = "Username is required.";
    if (!jira.password.trim() || jira.password.includes("•")) errors.password = "Password is required.";
  }
  return errors;
}

function validateConfluence(conf: ConfluenceConfig, isCloud: boolean, serverAuthMode: ServerAuthMode): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!conf.baseUrl.trim()) errors.baseUrl = "Base URL is required.";
  else if (!/^https?:\/\//.test(conf.baseUrl)) errors.baseUrl = "Must start with http:// or https://";
  else if (conf.baseUrl.endsWith("/")) errors.baseUrl = "Remove the trailing slash.";

  if (isCloud && !conf.email.trim()) errors.email = "Email is required for Cloud.";
  if (serverAuthMode === "pat" || isCloud) {
    if (!conf.apiToken.trim() || conf.apiToken.includes("•")) errors.apiToken = "API / Personal Access Token is required.";
  }
  if (!isCloud && serverAuthMode === "basic") {
    if (!conf.username.trim()) errors.username = "Username is required.";
    if (!conf.password.trim() || conf.password.includes("•")) errors.password = "Password is required.";
  }
  if (!conf.spaceKey.trim()) errors.spaceKey = "Space Key is required.";
  return errors;
}

export default function ConfigPage() {
  const [jira, setJira] = useState<JiraConfig>(EMPTY_JIRA);
  const [confluence, setConfluence] = useState<ConfluenceConfig>(EMPTY_CONF);
  const [teams, setTeams] = useState<TeamsConfig>({ defaultWebhookUrl: "", notifyChannel: "teams" });
  const [alerts, setAlerts] = useState<AlertsConfig>({ pollIntervalMinutes: 15 });

  const [show, setShow] = useState({ jiraPat: false, jiraPwd: false, confPat: false, confPwd: false, webhook: false });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false); // track if user tried to save (show inline errors)

  const [jiraConn, setJiraConn] = useState<ConnResult>({ status: "idle", message: "" });
  const [confConn, setConfConn] = useState<ConnResult>({ status: "idle", message: "" });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setJira({ ...EMPTY_JIRA, ...d.config.jira });
          setConfluence({ ...EMPTY_CONF, ...d.config.confluence });
          setTeams({ defaultWebhookUrl: "", notifyChannel: "teams", ...d.config.teams });
          setAlerts(d.config.alerts);
        }
        setLoading(false);
      });
  }, []);

  // Reset connection status when relevant fields change
  useEffect(() => { setJiraConn({ status: "idle", message: "" }); }, [jira.baseUrl, jira.apiToken, jira.username, jira.password]);
  useEffect(() => { setConfConn({ status: "idle", message: "" }); }, [confluence.baseUrl, confluence.apiToken, confluence.username, confluence.password, confluence.spaceKey]);

  async function handleSave() {
    setSubmitted(true);
    const jiraErrors = validateJira(jira);
    const confErrors = validateConfluence(confluence, jira.isCloud, jira.serverAuthMode);
    if (Object.keys(jiraErrors).length > 0 || Object.keys(confErrors).length > 0) {
      setToast({ type: "error", msg: "Please fix the errors below before saving." });
      setTimeout(() => setToast(null), 5000);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jira, confluence, teams, alerts }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ type: "success", msg: "Configuration saved!" });
        setSubmitted(false);
      } else {
        setToast({ type: "error", msg: data.error || "Failed to save" });
      }
    } catch (e) {
      setToast({ type: "error", msg: String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 5000);
    }
  }

  async function testJira() {
    setJiraConn({ status: "testing", message: "" });
    // Save first so the API route reads the latest values
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jira, confluence, teams, alerts }),
    });
    const res = await fetch("/api/jira/test");
    const data = await res.json();
    setJiraConn({
      status: data.success ? "ok" : "error",
      message: data.success
        ? `Connected as ${data.user?.displayName || data.user?.name || "unknown"}`
        : data.error,
    });
  }

  async function testConfluence() {
    setConfConn({ status: "testing", message: "" });
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jira, confluence, teams, alerts }),
    });
    const res = await fetch("/api/confluence/test");
    const data = await res.json();
    setConfConn({
      status: data.success ? "ok" : "error",
      message: data.success
        ? `Connected to space "${data.space?.name || confluence.spaceKey}"`
        : data.error,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const isCloud = jira.isCloud;
  const isBasicAuth = !isCloud && jira.serverAuthMode === "basic";
  const jiraErrors = submitted ? validateJira(jira) : {};
  const confErrors = submitted ? validateConfluence(confluence, isCloud, jira.serverAuthMode) : {};

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Configuration</h1>
      <p className="text-gray-500 mb-8 text-sm">
        All credentials are stored locally in{" "}
        <code className="bg-gray-100 px-1 rounded">config.json</code> — never sent to any external service.
      </p>

      {toast && (
        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium
          ${toast.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ── JIRA ──────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Jira</h2>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">Instance:</span>
            {(["Cloud", "Server / DC"] as const).map((label, i) => {
              const selected = i === 0 ? isCloud : !isCloud;
              return (
                <button key={label} onClick={() => setJira({ ...jira, isCloud: i === 0 })}
                  className={`px-3 py-1 text-xs font-medium border transition
                    ${i === 0 ? "rounded-l-md" : "rounded-r-md border-l-0"}
                    ${selected ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Field label="Base URL" required
            placeholder={isCloud ? "https://yourcompany.atlassian.net" : "https://mydomain.com/jira"}
            value={jira.baseUrl}
            hint={!isCloud ? "No trailing slash. e.g. https://company.com/jira" : undefined}
            error={jiraErrors.baseUrl}
            onChange={(v) => setJira({ ...jira, baseUrl: v })} />

          {isCloud && (
            <Field label="Email" required placeholder="you@company.com"
              value={jira.email} error={jiraErrors.email}
              onChange={(v) => setJira({ ...jira, email: v })} />
          )}

          {!isCloud && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Authentication method <Required /></label>
              <div className="flex gap-3">
                {(["pat", "basic"] as ServerAuthMode[]).map((mode) => (
                  <label key={mode}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer text-sm transition
                      ${jira.serverAuthMode === mode ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 hover:border-gray-300 text-gray-700"}`}>
                    <input type="radio" className="accent-blue-600"
                      checked={jira.serverAuthMode === mode}
                      onChange={() => setJira({ ...jira, serverAuthMode: mode })} />
                    {mode === "pat" ? "Personal Access Token (PAT)" : "Username & Password"}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {jira.serverAuthMode === "pat"
                  ? "Jira → Profile → Personal Access Tokens → Create token (requires Jira ≥ 8.14)"
                  : "Use your regular Jira login credentials"}
              </p>
            </div>
          )}

          {(isCloud || jira.serverAuthMode === "pat") && (
            <PasswordField required
              label={isCloud ? "API Token" : "Personal Access Token (PAT)"}
              value={jira.apiToken} show={show.jiraPat} error={jiraErrors.apiToken}
              onToggle={() => setShow({ ...show, jiraPat: !show.jiraPat })}
              onChange={(v) => setJira({ ...jira, apiToken: v })} />
          )}

          {isBasicAuth && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Username" required placeholder="your.username"
                value={jira.username} error={jiraErrors.username}
                onChange={(v) => setJira({ ...jira, username: v })} />
              <PasswordField label="Password" required
                value={jira.password} show={show.jiraPwd} error={jiraErrors.password}
                onToggle={() => setShow({ ...show, jiraPwd: !show.jiraPwd })}
                onChange={(v) => setJira({ ...jira, password: v })} />
            </div>
          )}

          <Field label="Default Project Key" placeholder="e.g. NWAP"
            value={jira.defaultProject}
            hint="Used for alert polling — can be changed per rule"
            onChange={(v) => setJira({ ...jira, defaultProject: v })} />
        </div>

        {/* Test Connection */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
          <ConnBadge result={jiraConn} />
          <button onClick={testJira} disabled={jiraConn.status === "testing"}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition">
            {jiraConn.status === "testing"
              ? <Loader2 size={14} className="animate-spin" />
              : <Wifi size={14} />}
            Test Connection
          </button>
        </div>
      </section>

      {/* ── CONFLUENCE ───────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Confluence</h2>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            same {isCloud ? "Cloud" : "Server"} instance as Jira
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <Field label="Base URL" required
            placeholder={isCloud ? "https://yourcompany.atlassian.net" : "https://mydomain.com/confluence"}
            value={confluence.baseUrl}
            hint={!isCloud ? "Usually a separate path/subdomain from Jira — check your browser URL on Confluence" : undefined}
            error={confErrors.baseUrl}
            onChange={(v) => setConfluence({ ...confluence, baseUrl: v })} />

          {isCloud && (
            <Field label="Email" required placeholder="you@company.com"
              value={confluence.email} error={confErrors.email}
              onChange={(v) => setConfluence({ ...confluence, email: v })} />
          )}

          {(isCloud || jira.serverAuthMode === "pat") && (
            <PasswordField required
              label={isCloud ? "API Token" : "Personal Access Token (PAT)"}
              hint={isCloud ? "Same token as Jira is fine" : "Can reuse the same PAT as Jira"}
              value={confluence.apiToken} show={show.confPat} error={confErrors.apiToken}
              onToggle={() => setShow({ ...show, confPat: !show.confPat })}
              onChange={(v) => setConfluence({ ...confluence, apiToken: v })} />
          )}

          {isBasicAuth && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Username" required placeholder="your.username"
                value={confluence.username} error={confErrors.username}
                onChange={(v) => setConfluence({ ...confluence, username: v })} />
              <PasswordField label="Password" required
                value={confluence.password} show={show.confPwd} error={confErrors.password}
                onToggle={() => setShow({ ...show, confPwd: !show.confPwd })}
                onChange={(v) => setConfluence({ ...confluence, password: v })} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Space Key" required placeholder="e.g. EADRAX"
              value={confluence.spaceKey} error={confErrors.spaceKey}
              hint="Found in Confluence → Space Settings → Space Details"
              onChange={(v) => setConfluence({ ...confluence, spaceKey: v })} />
            <Field label="Parent Page ID"
              placeholder="e.g. 8307652676"
              hint='From the page URL: /pages/{id}/'
              value={confluence.parentPageId}
              onChange={(v) => setConfluence({ ...confluence, parentPageId: v })} />
          </div>
        </div>

        <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800 flex gap-2">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Finding Parent Page ID:</strong> Open your &quot;Sprint-Review&quot; parent page in Confluence.
            The URL will contain <code className="bg-amber-100 px-1 rounded">/pages/8307652676/</code> — copy that number.
          </span>
        </div>

        {/* Test Connection */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
          <ConnBadge result={confConn} />
          <button onClick={testConfluence} disabled={confConn.status === "testing"}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition">
            {confConn.status === "testing"
              ? <Loader2 size={14} className="animate-spin" />
              : <Wifi size={14} />}
            Test Connection
          </button>
        </div>
      </section>

      {/* ── MS TEAMS ─────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">MS Teams Notifications</h2>
        <p className="text-xs text-gray-500 mb-4">Optional — leave blank if you don&apos;t have access yet.</p>

        <PasswordField
          label="Webhook URL"
          hint="Power Automate Workflow URL or legacy Incoming Webhook URL"
          value={teams.defaultWebhookUrl}
          show={show.webhook}
          onToggle={() => setShow({ ...show, webhook: !show.webhook })}
          onChange={(v) => setTeams({ ...teams, defaultWebhookUrl: v })} />

        <div className="mt-4 space-y-3">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
            <p className="font-semibold mb-2">Option A — Power Automate Workflow (Recommended)</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>Teams → channel → click <strong>···</strong> → <strong>Workflows</strong></li>
              <li>Search <strong>&quot;Post to a channel when a webhook request is received&quot;</strong></li>
              <li>Click → Next → Create → copy the <strong>HTTP POST URL</strong></li>
            </ol>
            <p className="mt-2 italic text-blue-600">No &quot;Workflows&quot;? Ask your Teams admin to enable Power Automate.</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
            <strong>Option B — Legacy Incoming Webhook:</strong> Channel → ··· → Connectors → &quot;Incoming Webhook&quot; → Configure → Copy URL. (Deprecated by Microsoft in 2024.)
          </div>
        </div>
      </section>

      {/* ── POLLING INTERVAL ─────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Alert Polling Interval</h2>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Check for new issues every</label>
          <select
            value={alerts.pollIntervalMinutes}
            onChange={(e) => setAlerts({ ...alerts, pollIntervalMinutes: Number(e.target.value) })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {POLL_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          You can also trigger a manual poll anytime using &quot;Poll Now&quot; on the Alerts page.
        </p>
      </section>

      {/* ── SAVE ─────────────────────────────────────── */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Configuration
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Required() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

function ConnBadge({ result }: { result: ConnResult }) {
  if (result.status === "idle") return <span className="text-xs text-gray-400">Not tested yet</span>;
  if (result.status === "testing") return <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Testing…</span>;
  if (result.status === "ok") return (
    <span className="text-xs text-green-700 flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
      <CheckCircle size={13} />{result.message}
    </span>
  );
  return (
    <span className="text-xs text-red-700 flex items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1 rounded-full max-w-xs truncate">
      <WifiOff size={13} className="flex-shrink-0" />{result.message}
    </span>
  );
}

function Field({ label, placeholder, value, hint, error, required, onChange }: {
  label: string; placeholder?: string; value: string;
  hint?: string; error?: string; required?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <Required />}
      </label>
      <input type="text" placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition
          ${error ? "border-red-400 focus:ring-red-400 bg-red-50" : "border-gray-300 focus:ring-blue-500"}`} />
      {error
        ? <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{error}</p>
        : hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function PasswordField({ label, hint, value, show, error, required, onToggle, onChange }: {
  label: string; hint?: string; value: string;
  show: boolean; error?: string; required?: boolean;
  onToggle: () => void; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <Required />}
      </label>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 transition
            ${error ? "border-red-400 focus:ring-red-400 bg-red-50" : "border-gray-300 focus:ring-blue-500"}`} />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error
        ? <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{error}</p>
        : hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
