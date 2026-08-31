"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  FileText, ExternalLink, Loader2, CheckCircle,
  AlertCircle, ChevronDown, ChevronRight, Bug, BarChart2, ChevronUp,
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
    _completionStatus?: "completed" | "not-completed" | "removed";
    // Story point custom fields (vary by Jira instance)
    customfield_10016?: number | null;
    customfield_10028?: number | null;
    customfield_10004?: number | null;
    [key: string]: unknown;
  };
}

interface JiraStory { issue: JiraIssue; subIssues: JiraIssue[]; }
interface Epic { key: string; summary: string; status: string; stories: JiraStory[]; orphanIssues: JiraIssue[]; }
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
  storyPointsFieldId?: string | null;
}

// ── Client-side helpers ───────────────────────────────────────────────────────

// Extract project prefix from a ticket key (e.g. "ICE" from "ICE-1373")
function projectOf(key: string) { return key.split("-")[0].toUpperCase(); }

// Client-side story points — mirrors lib/jira.ts getStoryPoints
function getStoryPoints(issue: JiraIssue, spFieldId?: string | null): number {
  const f = issue.fields as Record<string, unknown>;
  if (spFieldId) {
    const val = Number(f[spFieldId]);
    if (!isNaN(val) && val > 0) return val;
  }
  return Number(f.customfield_10016 ?? f.customfield_10028 ?? f.customfield_10004 ?? 0) || 0;
}

function isDoneStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "done" || s === "resolved" || s === "closed" ||
    s === "won't fix" || s === "wont fix";
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

function completionStatusBadge(status: "completed" | "not-completed" | "removed" | undefined) {
  if (!status) return null;
  if (status === "completed")
    return <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">✓ Done</span>;
  if (status === "not-completed")
    return <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 whitespace-nowrap">↩ Carried over</span>;
  return <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 whitespace-nowrap">✕ Removed</span>;
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EpicSection({ epic }: { epic: Epic }) {
  const [open, setOpen] = useState(true);
  const totalIssues = epic.stories.reduce((s, st) => s + 1 + st.subIssues.length, 0) + epic.orphanIssues.length;
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
        <span className="text-xs text-gray-400">{totalIssues} issue{totalIssues !== 1 ? "s" : ""}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          {epic.stories.length === 0 && epic.orphanIssues.length === 0
            ? <p className="px-5 py-4 text-sm text-gray-400 italic">No issues under this epic.</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-white text-xs uppercase">
                    <th className="px-4 py-2 text-left">Story / Task</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Sprint Result</th>
                    <th className="px-4 py-2 text-left">Assignee</th>
                    <th className="px-4 py-2 text-left">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {epic.stories.map((story, si) => (
                    <>
                      {/* Story row */}
                      <tr key={story.issue.key} className={si % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3 font-medium text-blue-600 text-xs">
                          {story.issue.key}<br />
                          <span className="text-gray-700 font-normal">{story.issue.fields.summary}</span>
                        </td>
                        <td className="px-4 py-2">{statusBadge(story.issue.fields.status.name)}</td>
                        <td className="px-4 py-2">{completionStatusBadge(story.issue.fields._completionStatus)}</td>
                        <td className="px-4 py-2 text-gray-700 text-xs">
                          {story.issue.fields.assignee?.displayName || <span className="text-gray-400 italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{story.issue.fields.issuetype.name}</td>
                      </tr>
                      {/* Task rows */}
                      {story.subIssues.map((task) => (
                        <tr key={task.key} className="bg-blue-50 border-l-4 border-blue-200">
                          <td className="pl-8 pr-4 py-2 text-xs text-blue-700">
                            <span className="text-gray-400 mr-1">↳</span>
                            <span className="font-medium">{task.key}</span><br />
                            <span className="text-gray-600 font-normal">{task.fields.summary}</span>
                          </td>
                          <td className="px-4 py-2">{statusBadge(task.fields.status.name)}</td>
                          <td className="px-4 py-2">{completionStatusBadge(task.fields._completionStatus)}</td>
                          <td className="px-4 py-2 text-gray-700 text-xs">
                            {task.fields.assignee?.displayName || <span className="text-gray-400 italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{task.fields.issuetype.name}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                  {epic.orphanIssues.map((issue, i) => (
                    <tr key={issue.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-medium text-blue-600 text-xs">
                        {issue.key}<br />
                        <span className="text-gray-700 font-normal">{issue.fields.summary}</span>
                      </td>
                      <td className="px-4 py-2">{statusBadge(issue.fields.status.name)}</td>
                      <td className="px-4 py-2">{completionStatusBadge(issue.fields._completionStatus)}</td>
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

function CapacityTable({
  history,
  filteredSP,
}: {
  history: SprintCapacity[];
  filteredSP?: { planned: number; delivered: number; ratio: string };
}) {
  const [open, setOpen] = useState(true);
  const current = history[history.length - 1];
  if (!current) return null;

  // Use client-recalculated numbers if a filter is active
  const displayPlanned  = filteredSP ? filteredSP.planned  : current.plannedPoints;
  const displayDelivered = filteredSP ? filteredSP.delivered : current.deliveredPoints;
  const displayRatio    = filteredSP ? filteredSP.ratio    : current.completionRatio;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-blue-50 hover:bg-blue-100 transition text-left">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <BarChart2 size={15} className="text-blue-500" />
          <span className="font-semibold text-gray-800 text-sm">Sprint Report — Completion Ratio</span>
          {filteredSP && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">filtered view</span>
          )}
        </div>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">current sprint</span>
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
              <tr className="bg-white font-semibold">
                <td className="px-4 py-2 text-gray-800">
                  {current.sprintName}
                  <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">current</span>
                </td>
                <td className="px-4 py-2 text-center text-gray-700">{displayPlanned > 0 ? displayPlanned : "—"}</td>
                <td className="px-4 py-2 text-center text-gray-700">{displayDelivered > 0 ? displayDelivered : "—"}</td>
                <td className="px-4 py-2 text-center">{completionBadge(displayRatio)}</td>
              </tr>
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
  const [selectedProject, setSelectedProject] = useState("");   // "" = show all
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set()); // empty = all
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sprintData, setSprintData] = useState<SprintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string; title: string; updated: boolean;
    epicCount: number; issueCount: number; defectCount: number; sprintCount: number;
  } | null>(null);

  // Close status dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleFetch() {
    if (!sprintId.trim()) return;
    setLoading(true); setError(null); setSprintData(null); setResult(null);
    setSelectedProject(""); setSelectedStatuses(new Set());
    try {
      const res = await fetch(`/api/jira/sprint?id=${sprintId.trim()}`);
      const data = await res.json();
      if (data.success) {
        setSprintData({
          sprint: data.sprint, epics: data.epics, noEpic: data.noEpic,
          defects: data.defects, capacityHistory: data.capacityHistory,
          storyPointsFieldId: data.storyPointsFieldId ?? null,
        });
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
      if (data.success) {
        setResult(data);
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        setError(data.error || "Failed to create Confluence page");
      }
    } catch (e) { setError(String(e)); }
    finally { setCreating(false); }
  }

  // ── Derived: unique project prefixes from all fetched issues ─────────────────
  const projectPrefixes = useMemo<string[]>(() => {
    if (!sprintData) return [];
    const prefixes = new Set<string>();
    const addKey = (key: string) => prefixes.add(projectOf(key));
    sprintData.epics.forEach(e => {
      e.stories.forEach(st => { addKey(st.issue.key); st.subIssues.forEach(t => addKey(t.key)); });
      e.orphanIssues.forEach(i => addKey(i.key));
    });
    sprintData.noEpic.forEach(i => addKey(i.key));
    sprintData.defects.forEach(d => addKey(d.key));
    return Array.from(prefixes).sort();
  }, [sprintData]);

  // ── Derived: all unique statuses from fetched data ────────────────────────────
  const statusOptions = useMemo<string[]>(() => {
    if (!sprintData) return [];
    const statuses = new Set<string>();
    const addIssue = (i: JiraIssue) => statuses.add(i.fields.status.name);
    sprintData.epics.forEach(e => {
      e.stories.forEach(st => { addIssue(st.issue); st.subIssues.forEach(addIssue); });
      e.orphanIssues.forEach(addIssue);
    });
    sprintData.noEpic.forEach(addIssue);
    sprintData.defects.forEach(addIssue);
    return Array.from(statuses).sort();
  }, [sprintData]);

  function toggleStatus(status: string) {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

  // ── Derived: client-side filtered view (project + status) ─────────────────────
  const view = useMemo(() => {
    if (!sprintData) return null;
    const matchProject = (key: string) => !selectedProject || projectOf(key) === selectedProject;
    const matchStatus  = (status: string) => selectedStatuses.size === 0 || selectedStatuses.has(status);
    const filterIssue  = (i: JiraIssue) => matchProject(i.key) && matchStatus(i.fields.status.name);

    const filteredEpics = sprintData.epics
      .map(epic => ({
        ...epic,
        stories: epic.stories
          .map(st => ({ ...st, subIssues: st.subIssues.filter(filterIssue) }))
          .filter(st => filterIssue(st.issue) || st.subIssues.length > 0),
        orphanIssues: epic.orphanIssues.filter(filterIssue),
      }))
      .filter(e => e.stories.length > 0 || e.orphanIssues.length > 0);

    return {
      ...sprintData,
      epics: filteredEpics,
      noEpic: sprintData.noEpic.filter(filterIssue),
      defects: sprintData.defects.filter(i => matchProject(i.key) && matchStatus(i.fields.status.name)),
    };
  }, [sprintData, selectedProject, selectedStatuses]);

  // ── Derived: recalculate story points for the filtered view ───────────────────
  const filteredCapacity = useMemo(() => {
    if (!view || !sprintData) return undefined;
    // Only override when a filter is active
    const hasFilter = !!selectedProject || selectedStatuses.size > 0;
    if (!hasFilter) return undefined;

    const allIssues: JiraIssue[] = [];
    view.epics.forEach(e => {
      e.stories.forEach(st => { allIssues.push(st.issue); allIssues.push(...st.subIssues); });
      allIssues.push(...e.orphanIssues);
    });
    allIssues.push(...view.noEpic);

    const nonEpic = allIssues.filter(i => i.fields.issuetype.name !== "Epic");
    const spFieldId = sprintData.storyPointsFieldId;
    const planned   = nonEpic.reduce((sum, i) => sum + getStoryPoints(i, spFieldId), 0);
    const delivered = nonEpic.filter(i => isDoneStatus(i.fields.status.name))
                             .reduce((sum, i) => sum + getStoryPoints(i, spFieldId), 0);
    const ratio = planned > 0 ? Math.round((delivered / planned) * 100) + "%" : "N/A";
    return { planned, delivered, ratio };
  }, [view, sprintData, selectedProject, selectedStatuses]);

  const totalIssues = view
    ? view.epics.reduce((s, e) => s + e.stories.reduce((ss, st) => ss + 1 + st.subIssues.length, 0) + e.orphanIssues.length, 0) + view.noEpic.length
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

      {/* Input row */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex gap-3 items-end flex-wrap">
          {/* Sprint ID */}
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sprint ID
              <span className="ml-2 text-xs text-gray-400 font-normal">(Jira board URL → sprintId=…)</span>
            </label>
            <input type="text" placeholder="e.g. 42" value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Project filter dropdown — populated after fetch */}
          <div className="w-44">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Project</label>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              disabled={projectPrefixes.length === 0}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">All Projects</option>
              {projectPrefixes.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Status multi-select — checkbox dropdown */}
          <div className="w-48 relative" ref={statusDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
            <button
              type="button"
              disabled={statusOptions.length === 0}
              onClick={() => setStatusDropdownOpen(o => !o)}
              className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <span className="truncate text-left">
                {selectedStatuses.size === 0
                  ? "All Statuses"
                  : `${selectedStatuses.size} selected`}
              </span>
              {statusOptions.length > 0 && (
                statusDropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />
              )}
            </button>

            {statusDropdownOpen && statusOptions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
                {/* Select all / Clear */}
                <div className="flex gap-2 px-3 py-1.5 border-b border-gray-100">
                  <button
                    className="text-xs text-blue-600 underline"
                    onClick={() => setSelectedStatuses(new Set())}
                  >All</button>
                  <span className="text-gray-300">|</span>
                  <button
                    className="text-xs text-blue-600 underline"
                    onClick={() => setSelectedStatuses(new Set(statusOptions))}
                  >None</button>
                </div>
                {statusOptions.map(status => {
                  const checked = selectedStatuses.size === 0 || selectedStatuses.has(status);
                  return (
                    <label key={status} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          // If currently "all selected" (empty set), clicking a checkbox
                          // means "deselect everything except the clicked one"
                          if (selectedStatuses.size === 0) {
                            const allExcept = new Set(statusOptions.filter(s => s !== status));
                            setSelectedStatuses(allExcept);
                          } else {
                            toggleStatus(status);
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-gray-700 truncate">{status}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={handleFetch} disabled={loading || !sprintId.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition h-[38px] self-end">
            {loading && <Loader2 size={15} className="animate-spin" />}
            Fetch Sprint
          </button>
        </div>

        {/* Active filter hints */}
        {(selectedProject || selectedStatuses.size > 0) && (
          <p className="mt-2 text-xs text-blue-600 flex items-center gap-2 flex-wrap">
            {selectedProject && <span>Project: <strong>{selectedProject}-*</strong></span>}
            {selectedStatuses.size > 0 && (
              <span>Status: <strong>{Array.from(selectedStatuses).join(", ")}</strong></span>
            )}
            <span>·</span>
            <button className="underline" onClick={() => { setSelectedProject(""); setSelectedStatuses(new Set()); }}>
              clear all filters
            </button>
          </p>
        )}
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

      {view && (
        <>
          {/* Sprint meta bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-gray-900">{view.sprint.name}</h2>
                  {view.sprint.state === "closed" && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">📋 Closed Sprint</span>
                  )}
                </div>
                <div className="flex gap-4 text-sm text-gray-500">
                  <span>📅 {fmt(view.sprint.startDate)} → {fmt(view.sprint.endDate)}</span>
                  {statusBadge(view.sprint.state)}
                </div>
                {view.sprint.state === "closed" && (
                  <p className="mt-2 text-xs text-slate-500">
                    Sprint Result column shows official completion status from the Jira Sprint Report (✓ Done / ↩ Carried over / ✕ Removed).
                  </p>
                )}
              </div>
              <div className="flex gap-6 text-center text-sm">
                {[
                  { label: "Epics", val: view.epics.length },
                  { label: "Stories", val: view.epics.reduce((s, e) => s + e.stories.length, 0) + view.noEpic.length },
                  { label: "Defects", val: view.defects.length, red: true },
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
          {view.epics.map((epic) => <EpicSection key={epic.key} epic={epic} />)}
          {view.noEpic.length > 0 && (
            <EpicSection epic={{ key: "—", summary: "Issues without an Epic", status: "N/A", stories: [], orphanIssues: view.noEpic }} />
          )}

          {/* Section: Defects */}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-8 mb-3">Defects</h3>
          <DefectsTable defects={view.defects} />

          {/* Section: Capacity */}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-8 mb-3">Sprint Report</h3>
          <CapacityTable history={view.capacityHistory} filteredSP={filteredCapacity} />

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
