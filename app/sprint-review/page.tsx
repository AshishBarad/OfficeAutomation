"use client";
import { useState } from "react";
import {
  FileText, ExternalLink, Loader2, CheckCircle,
  AlertCircle, ChevronDown, ChevronRight, Bug, BarChart2,
} from "lucide-react";

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    assignee: { displayName: string } | null;
    reporter?: { displayName: string } | null;
    description: string | null;
    priority?: { name: string };
    resolution?: { name: string } | null;
    duedate?: string | null;
    created: string;
    updated: string;
  };
}

interface Epic { key: string; summary: string; status: string; issues: JiraIssue[]; }
interface SprintCapacity {
  sprintId: number; sprintName: string;
  plannedPoints: number; deliveredPoints: number; completionRatio: string;
}
interface SprintData {
  sprint: { id: number; name: string; state: string; startDate: string; endDate: string; };
  epics: Epic[];
  noEpic: JiraIssue[];
  defects: JiraIssue[];
  capacityHistory: SprintCapacity[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const cls =
    s.includes("done") || s.includes("resolved") || s.includes("closed") ? "bg-green-100 text-green-800" :
    s.includes("progress") || s.includes("review") ? "bg-blue-100 text-blue-800" :
    s.includes("blocked") ? "bg-red-100 text-red-800" :
    "bg-gray-100 text-gray-700";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{status}</span>;
}

function priorityBadge(priority: string | undefined) {
  if (!priority) return <span className="text-gray-400">—</span>;
  const p = priority.toLowerCase();
  const cls =
    p === "critical" || p === "blocker" ? "bg-red-100 text-red-800" :
    p === "high" || p === "major" ? "bg-orange-100 text-orange-800" :
    p === "medium" || p === "normal" ? "bg-yellow-100 text-yellow-800" :
    "bg-gray-100 text-gray-600";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{priority}</span>;
}

function completionBadge(ratio: string) {
  const n = parseInt(ratio);
  const cls = isNaN(n) ? "bg-gray-100 text-gray-600" :
    n >= 80 ? "bg-green-100 text-green-800" :
    n >= 60 ? "bg-yellow-100 text-yellow-800" :
    "bg-red-100 text-red-800";
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{ratio}</span>;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EpicSection({ epic }: { epic: Epic }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition text-left">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span className="font-semibold text-gray-800 text-sm">{epic.key}</span>
          <span className="text-gray-600 text-sm">{epic.summary}</span>
          {statusBadge(epic.status)}
        </div>
        <span className="text-xs text-gray-400">{epic.issues.length} issue{epic.issues.length !== 1 ? "s" : ""}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          {epic.issues.length === 0
            ? <p className="px-5 py-4 text-sm text-gray-400 italic">No issues under this epic.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-white text-xs uppercase">
                    <th className="px-4 py-2 text-left">Story</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Assignee</th>
                    <th className="px-4 py-2 text-center">SP</th>
                    <th className="px-4 py-2 text-left">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {epic.issues.map((issue, i) => (
                    <tr key={issue.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-medium text-blue-600 text-xs">
                        {issue.key}<br />
                        <span className="text-gray-700 font-normal">{issue.fields.summary}</span>
                      </td>
                      <td className="px-4 py-2">{statusBadge(issue.fields.status.name)}</td>
                      <td className="px-4 py-2 text-gray-700 text-xs">
                        {issue.fields.assignee?.displayName || <span className="text-gray-400 italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-2 text-center text-gray-500 text-xs">—</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{issue.fields.issuetype.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}

function DefectsTable({ defects }: { defects: JiraIssue[] }) {
  const [open, setOpen] = useState(true);
  if (defects.length === 0) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-xl px-5 py-4 text-sm text-green-700 flex items-center gap-2">
        <CheckCircle size={15} /> No defects in this sprint 🎉
      </div>
    );
  }
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-red-50 hover:bg-red-100 transition text-left">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Bug size={15} className="text-red-500" />
          <span className="font-semibold text-gray-800 text-sm">Defects</span>
          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{defects.length}</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-800 text-white uppercase">
                <th className="px-3 py-2 text-left">Key</th>
                <th className="px-3 py-2 text-left">Summary</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-left">Assignee</th>
                <th className="px-3 py-2 text-left">Reporter</th>
                <th className="px-3 py-2 text-left">Priority</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {defects.map((issue, i) => (
                <tr key={issue.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-2 font-medium text-blue-600 whitespace-nowrap">{issue.key}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-xs">{issue.fields.summary}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmt(issue.fields.created)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmt(issue.fields.updated)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmt(issue.fields.duedate)}</td>
                  <td className="px-3 py-2 text-gray-700">{issue.fields.assignee?.displayName || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{issue.fields.reporter?.displayName || "—"}</td>
                  <td className="px-3 py-2">{priorityBadge(issue.fields.priority?.name)}</td>
                  <td className="px-3 py-2">{statusBadge(issue.fields.status.name)}</td>
                  <td className="px-3 py-2 text-gray-600">{issue.fields.resolution?.name || "Unresolved"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CapacityTable({ history }: { history: SprintCapacity[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-blue-50 hover:bg-blue-100 transition text-left">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <BarChart2 size={15} className="text-blue-500" />
          <span className="font-semibold text-gray-800 text-sm">Sprint Report — Completion Ratio</span>
        </div>
        <span className="text-xs text-gray-400">{history.length} sprint{history.length !== 1 ? "s" : ""}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white text-xs uppercase">
                <th className="px-4 py-2 text-left">Sprint</th>
                <th className="px-4 py-2 text-center">Planned Capacity (SP)</th>
                <th className="px-4 py-2 text-center">Delivered Velocity (SP)</th>
                <th className="px-4 py-2 text-center">Completion Ratio</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, i) => {
                const isCurrent = i === history.length - 1;
                return (
                  <tr key={row.sprintId}
                    className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${isCurrent ? "font-semibold" : ""}`}>
                    <td className="px-4 py-2 text-gray-800">
                      {row.sprintName}
                      {isCurrent && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">current</span>}
                    </td>
                    <td className="px-4 py-2 text-center text-gray-700">{row.plannedPoints > 0 ? row.plannedPoints : "—"}</td>
                    <td className="px-4 py-2 text-center text-gray-700">{row.deliveredPoints > 0 ? row.deliveredPoints : "—"}</td>
                    <td className="px-4 py-2 text-center">{completionBadge(row.completionRatio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SprintReviewPage() {
  const [sprintId, setSprintId] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sprintData, setSprintData] = useState<SprintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string; title: string; updated: boolean;
    epicCount: number; issueCount: number; defectCount: number; sprintCount: number;
  } | null>(null);

  async function handleFetch() {
    if (!sprintId.trim()) return;
    setLoading(true); setError(null); setSprintData(null); setResult(null);
    try {
      const res = await fetch(`/api/jira/sprint?id=${sprintId.trim()}`);
      const data = await res.json();
      if (data.success) {
        setSprintData({ sprint: data.sprint, epics: data.epics, noEpic: data.noEpic, defects: data.defects, capacityHistory: data.capacityHistory });
      } else {
        setError(data.error || "Failed to fetch sprint data");
      }
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/confluence/create-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: sprintId.trim() }),
      });
      const data = await res.json();
      if (data.success) setResult(data);
      else setError(data.error || "Failed to create Confluence page");
    } catch (e) { setError(String(e)); }
    finally { setCreating(false); }
  }

  const totalIssues = sprintData
    ? sprintData.epics.reduce((s, e) => s + e.issues.length, 0) + sprintData.noEpic.length
    : 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="text-blue-500" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">Sprint Review</h1>
      </div>
      <p className="text-gray-500 mb-8 text-sm">
        Enter a Jira Sprint ID to preview and generate a Confluence sprint review page.
      </p>

      {/* Input */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sprint ID
          <span className="ml-2 text-xs text-gray-400 font-normal">(Jira board URL → sprintId=…)</span>
        </label>
        <div className="flex gap-3">
          <input type="text" placeholder="e.g. 42" value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={handleFetch} disabled={loading || !sprintId.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {loading && <Loader2 size={15} className="animate-spin" />}
            Fetch Sprint
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
          <CheckCircle size={16} className="flex-shrink-0" />
          <div className="flex-1">
            <span className="font-medium">{result.updated ? "Page updated!" : "Page created!"}</span>{" "}
            {result.title} — {result.epicCount} epics · {result.issueCount} stories · {result.defectCount} defects · {result.sprintCount} sprint{result.sprintCount !== 1 ? "s" : ""} in capacity
          </div>
          <a href={result.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 font-medium underline hover:text-green-900 whitespace-nowrap">
            Open in Confluence <ExternalLink size={13} />
          </a>
        </div>
      )}

      {sprintData && (
        <>
          {/* Sprint meta bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">{sprintData.sprint.name}</h2>
                <div className="flex gap-4 text-sm text-gray-500">
                  <span>📅 {fmt(sprintData.sprint.startDate)} → {fmt(sprintData.sprint.endDate)}</span>
                  {statusBadge(sprintData.sprint.state)}
                </div>
              </div>
              <div className="flex gap-6 text-center text-sm">
                {[
                  { label: "Epics", val: sprintData.epics.length },
                  { label: "Stories", val: totalIssues },
                  { label: "Defects", val: sprintData.defects.length, red: true },
                ].map(({ label, val, red }) => (
                  <div key={label}>
                    <div className={`text-xl font-bold ${red && val > 0 ? "text-red-600" : "text-gray-900"}`}>{val}</div>
                    <div className="text-gray-400 text-xs">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section: Epics */}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Epics &amp; Stories</h3>
          {sprintData.epics.map((epic) => <EpicSection key={epic.key} epic={epic} />)}
          {sprintData.noEpic.length > 0 && (
            <EpicSection epic={{ key: "—", summary: "Issues without an Epic", status: "N/A", issues: sprintData.noEpic }} />
          )}

          {/* Section: Defects */}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-8 mb-3">Defects</h3>
          <DefectsTable defects={sprintData.defects} />

          {/* Section: Capacity */}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-8 mb-3">Sprint Report</h3>
          <CapacityTable history={sprintData.capacityHistory} />

          {/* Create button */}
          <div className="mt-8 flex justify-end">
            <button onClick={handleCreate} disabled={creating}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition text-sm">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {creating ? "Creating Confluence Page…" : "Create Confluence Page"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
