"use client";
import { useEffect, useState } from "react";
import {
  Bell,
  Plus,
  Trash2,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  Edit2,
  X,
  Save,
  Send,
} from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  issueTypes: string[];
  assignees: string[];
  teamsWebhookUrl: string;
  enabled: boolean;
}

const ISSUE_TYPE_OPTIONS = [
  "Bug",
  "Story",
  "Task",
  "Epic",
  "Sub-task",
  "Improvement",
  "New Feature",
];

function RuleModal({
  rule,
  onSave,
  onClose,
}: {
  rule: Partial<AlertRule> | null;
  onSave: (r: Partial<AlertRule>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<AlertRule>>(
    rule || {
      name: "",
      issueTypes: [],
      assignees: [],
      teamsWebhookUrl: "",
      enabled: true,
    }
  );
  const [assigneeInput, setAssigneeInput] = useState("");

  function toggleType(t: string) {
    const types = form.issueTypes || [];
    setForm({
      ...form,
      issueTypes: types.includes(t) ? types.filter((x) => x !== t) : [...types, t],
    });
  }

  function addAssignee() {
    const val = assigneeInput.trim();
    if (!val) return;
    const list = form.assignees || [];
    if (!list.includes(val)) setForm({ ...form, assignees: [...list, val] });
    setAssigneeInput("");
  }

  function removeAssignee(a: string) {
    setForm({ ...form, assignees: (form.assignees || []).filter((x) => x !== a) });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">
            {rule?.id ? "Edit Rule" : "New Alert Rule"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rule Name
            </label>
            <input
              type="text"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Bugs assigned to Ashish"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Issue types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Watch Issue Types
            </label>
            <div className="flex flex-wrap gap-2">
              {ISSUE_TYPE_OPTIONS.map((t) => {
                const selected = (form.issueTypes || []).includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition
                      ${selected ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Select any. Custom types can be added via assignees field.
            </p>
          </div>

          {/* Assignees */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Watch Assignees
              <span className="ml-1 text-xs text-gray-400 font-normal">
                (Jira username or display name — leave empty to watch all)
              </span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={assigneeInput}
                onChange={(e) => setAssigneeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAssignee()}
                placeholder="e.g. Ashish Barad"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addAssignee}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm transition"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form.assignees || []).map((a) => (
                <span
                  key={a}
                  className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full"
                >
                  {a}
                  <button
                    onClick={() => removeAssignee(a)}
                    className="hover:text-red-500 ml-1"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Teams webhook override */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teams Webhook URL
              <span className="ml-1 text-xs text-gray-400 font-normal">
                (override global — leave empty to use default)
              </span>
            </label>
            <input
              type="text"
              value={form.teamsWebhookUrl || ""}
              onChange={(e) =>
                setForm({ ...form, teamsWebhookUrl: e.target.value })
              }
              placeholder="https://outlook.office.com/webhook/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Rule enabled</span>
            <button
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                form.enabled ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                  form.enabled ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Save size={14} />
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [webhookConfigured, setWebhookConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editRule, setEditRule] = useState<Partial<AlertRule> | null | undefined>(undefined);
  const [pollResult, setPollResult] = useState<null | {
    results: Array<{ rule: string; issuesFound: number; error?: string }>;
    since: string;
  }>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    fetch("/api/alerts/rules")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRules(d.rules);
        setLoading(false);
      });
    // Check if webhook is configured
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setWebhookConfigured(!!d.config.teams?.defaultWebhookUrl);
      });
  }, []);

  async function saveRule(form: Partial<AlertRule>) {
    const isEdit = !!form.id;
    const res = await fetch("/api/alerts/rules", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) {
      if (isEdit) {
        setRules(rules.map((r) => (r.id === data.rule.id ? data.rule : r)));
      } else {
        setRules([...rules, data.rule]);
      }
      showToast("success", `Rule ${isEdit ? "updated" : "created"}!`);
    } else {
      showToast("error", data.error);
    }
    setEditRule(undefined);
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this rule?")) return;
    const res = await fetch(`/api/alerts/rules?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setRules(rules.filter((r) => r.id !== id));
      showToast("success", "Rule deleted");
    }
  }

  async function toggleRule(rule: AlertRule) {
    const res = await fetch("/api/alerts/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
    });
    const data = await res.json();
    if (data.success) {
      setRules(rules.map((r) => (r.id === rule.id ? data.rule : r)));
    }
  }

  async function sendTestAlert() {
    setTestingAlert(true);
    try {
      const res = await fetch("/api/teams/test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Test alert sent! Check your Teams channel.");
      } else {
        showToast("error", data.error || "Failed to send test alert");
      }
    } catch (e) {
      showToast("error", String(e));
    } finally {
      setTestingAlert(false);
    }
  }

  async function pollNow() {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/alerts/poll", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setPollResult(data);
        const total = data.results?.reduce(
          (s: number, r: { issuesFound: number }) => s + r.issuesFound,
          0
        );
        showToast(
          "success",
          `Poll complete — ${total} new issue(s) found across ${data.results?.length} rule(s).`
        );
      } else {
        showToast("error", data.error || "Poll failed");
      }
    } catch (e) {
      showToast("error", String(e));
    } finally {
      setPolling(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Bell className="text-purple-500" size={24} />
          <h1 className="text-2xl font-bold text-gray-900">Teams Alerts</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={sendTestAlert}
            disabled={testingAlert}
            title="Send a dummy alert to your configured Teams webhook to verify it's working"
            className="flex items-center gap-2 border border-purple-300 text-purple-700 bg-purple-50 px-4 py-2 rounded-lg text-sm hover:bg-purple-100 transition disabled:opacity-50"
          >
            {testingAlert ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Test Alert
          </button>
          <button
            onClick={pollNow}
            disabled={polling}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50"
          >
            {polling ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Poll Now
          </button>
          <button
            onClick={() => setEditRule(null)}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 transition"
          >
            <Plus size={14} />
            New Rule
          </button>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Each rule watches for specific Jira issue types and assignees, then sends alerts to a
        Teams channel.
      </p>

      {/* Webhook status banner */}
      {webhookConfigured === false && (
        <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>
            No Teams webhook configured — alerts won&apos;t be sent.{" "}
            <a href="/config" className="underline font-medium hover:text-amber-900">
              Add one in Config →
            </a>
          </span>
        </div>
      )}
      {webhookConfigured === true && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
          <CheckCircle size={16} className="flex-shrink-0" />
          <span>Teams webhook configured. Click <strong>Test Alert</strong> to verify it&apos;s working.</span>
        </div>
      )}

      {toast && (
        <div
          className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium
            ${toast.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}
        >
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Poll result */}
      {pollResult && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Last Poll — since {new Date(pollResult.since).toLocaleString()}
          </h3>
          <div className="space-y-2">
            {pollResult.results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{r.rule}</span>
                {r.error ? (
                  <span className="text-red-600 text-xs">{r.error.slice(0, 60)}</span>
                ) : (
                  <span
                    className={`font-medium ${r.issuesFound > 0 ? "text-green-700" : "text-gray-400"}`}
                  >
                    {r.issuesFound} issue{r.issuesFound !== 1 ? "s" : ""} found
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-blue-500" size={28} />
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Bell size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No alert rules yet</p>
          <p className="text-sm mt-1">Click &quot;New Rule&quot; to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-white border rounded-xl p-5 transition ${
                rule.enabled ? "border-gray-200" : "border-gray-100 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        rule.enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {rule.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                    <span>
                      <span className="font-medium text-gray-700">Types:</span>{" "}
                      {rule.issueTypes.length > 0
                        ? rule.issueTypes.join(", ")
                        : "All types"}
                    </span>
                    <span>
                      <span className="font-medium text-gray-700">Assignees:</span>{" "}
                      {rule.assignees.length > 0
                        ? rule.assignees.join(", ")
                        : "Anyone"}
                    </span>
                    {rule.teamsWebhookUrl && (
                      <span>
                        <span className="font-medium text-gray-700">Channel:</span> Custom webhook
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleRule(rule)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      rule.enabled ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                        rule.enabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => setEditRule(rule)}
                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {editRule !== undefined && (
        <RuleModal
          rule={editRule}
          onSave={saveRule}
          onClose={() => setEditRule(undefined)}
        />
      )}
    </div>
  );
}
