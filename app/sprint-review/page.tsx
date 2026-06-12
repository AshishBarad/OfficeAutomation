"use client";
import { useState } from "react";
import {
  FileText,
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    assignee: { displayName: string } | null;
    description: string | null;
  };
}

interface Epic {
  key: string;
  summary: string;
  status: string;
  issues: JiraIssue[];
}

interface SprintData {
  sprint: {
    id: number;
    name: string;
    state: string;
    startDate: string;
    endDate: string;
  };
  epics: Epic[];
  noEpic: JiraIssue[];
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const cls =
    s.includes("done") || s.includes("resolved") || s.includes("closed")
      ? "bg-green-100 text-green-800"
      : s.includes("progress") || s.includes("review")
      ? "bg-blue-100 text-blue-800"
      : s.includes("blocked")
      ? "bg-red-100 text-red-800"
      : "bg-gray-100 text-gray-700";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string) {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function EpicSection({ epic }: { epic: Epic }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-semibold text-gray-800">{epic.key}</span>
          <span className="text-gray-600 text-sm">{epic.summary}</span>
          {statusBadge(epic.status)}
        </div>
        <span className="text-xs text-gray-400">
          {epic.issues.length} issue{epic.issues.length !== 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          {epic.issues.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400 italic">No issues under this epic.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-white text-xs uppercase">
                  <th className="px-4 py-2 text-left">Story in Sprint</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-left">Assignee</th>
                  <th className="px-4 py-2 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {epic.issues.map((issue, i) => (
                  <tr
                    key={issue.key}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td className="px-4 py-3 font-medium text-blue-600">
                      {issue.key}
                      <br />
                      <span className="text-gray-700 font-normal text-xs">
                        {issue.fields.summary}
                      </span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(issue.fields.status.name)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {typeof issue.fields.description === "string"
                        ? issue.fields.description.slice(0, 100)
                        : issue.fields.description
                        ? "(ADF content)"
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {issue.fields.assignee?.displayName || (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {issue.fields.issuetype.name}
                    </td>
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

export default function SprintReviewPage() {
  const [sprintId, setSprintId] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sprintData, setSprintData] = useState<SprintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string;
    title: string;
    updated: boolean;
    epicCount: number;
    issueCount: number;
  } | null>(null);

  async function handleFetch() {
    if (!sprintId.trim()) return;
    setLoading(true);
    setError(null);
    setSprintData(null);
    setResult(null);
    try {
      const res = await fetch(`/api/jira/sprint?id=${sprintId.trim()}`);
      const data = await res.json();
      if (data.success) {
        setSprintData({ sprint: data.sprint, epics: data.epics, noEpic: data.noEpic });
      } else {
        setError(data.error || "Failed to fetch sprint data");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/confluence/create-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: sprintId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || "Failed to create Confluence page");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  const totalIssues = sprintData
    ? sprintData.epics.reduce((s, e) => s + e.issues.length, 0) +
      sprintData.noEpic.length
    : 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="text-blue-500" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">Sprint Review</h1>
      </div>
      <p className="text-gray-500 mb-8 text-sm">
        Enter a Jira Sprint ID to preview the data and generate a Confluence sprint review page.
      </p>

      {/* Input */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sprint ID
          <span className="ml-2 text-xs text-gray-400 font-normal">
            (find it in Jira → Board → Sprint → URL contains sprintId=...)
          </span>
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="e.g. 42"
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleFetch}
            disabled={loading || !sprintId.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            Fetch Sprint
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
          <CheckCircle size={16} className="flex-shrink-0" />
          <div className="flex-1">
            <span className="font-medium">
              {result.updated ? "Page updated!" : "Page created!"}
            </span>{" "}
            {result.title} — {result.epicCount} epics, {result.issueCount} issues
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-medium underline hover:text-green-900"
          >
            Open in Confluence <ExternalLink size={13} />
          </a>
        </div>
      )}

      {/* Sprint preview */}
      {sprintData && (
        <>
          {/* Sprint meta */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">
                  {sprintData.sprint.name}
                </h2>
                <div className="flex gap-4 text-sm text-gray-500">
                  <span>
                    📅 {formatDate(sprintData.sprint.startDate)} →{" "}
                    {formatDate(sprintData.sprint.endDate)}
                  </span>
                  <span>
                    {statusBadge(sprintData.sprint.state)}
                  </span>
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <div>
                  <span className="font-bold text-gray-900 text-xl">
                    {sprintData.epics.length}
                  </span>{" "}
                  epics
                </div>
                <div>
                  <span className="font-bold text-gray-900 text-xl">{totalIssues}</span>{" "}
                  total issues
                </div>
              </div>
            </div>
          </div>

          {/* Epics */}
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Epics &amp; Stories
          </h3>
          {sprintData.epics.map((epic) => (
            <EpicSection key={epic.key} epic={epic} />
          ))}

          {/* No-epic issues */}
          {sprintData.noEpic.length > 0 && (
            <EpicSection
              epic={{
                key: "—",
                summary: "Issues without an Epic",
                status: "N/A",
                issues: sprintData.noEpic,
              }}
            />
          )}

          {/* Create button */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition text-sm"
            >
              {creating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileText size={16} />
              )}
              {creating ? "Creating Confluence Page…" : "Create Confluence Page"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
