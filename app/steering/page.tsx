"use client";
import { useState, useRef } from "react";
import {
  FileText, Loader2, CheckCircle, AlertCircle, ExternalLink,
  Plus, Trash2, Brain, ChevronDown, ChevronRight, Sparkles, ChevronUp,
  GripVertical,
} from "lucide-react";
import type { SteeringContent, SummaryRow, EpicDeepDive, Workstream, StatusType } from "@/lib/ai-types";

const STATUS_OPTIONS: { value: StatusType; label: string; color: string }[] = [
  { value: "on-track",     label: "🟢 On Track",            color: "text-green-700 bg-green-50 border-green-200" },
  { value: "managed-risk", label: "🟡 Managed Risk",        color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  { value: "escalation",   label: "🔴 Escalation Required", color: "text-red-700 bg-red-50 border-red-200" },
  { value: "planned",      label: "🔵 Planned",             color: "text-blue-700 bg-blue-50 border-blue-200" },
];

function StatusSelect({ value, onChange }: { value: StatusType; onChange: (v: StatusType) => void }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as StatusType)}
      className={`text-xs font-medium px-2 py-1 rounded border ${opt.color} focus:outline-none`}
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function EditableText({
  value, onChange, className, multiline,
}: {
  value: string; onChange: (v: string) => void; className?: string; multiline?: boolean;
}) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none ${className ?? ""}`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${className ?? ""}`}
    />
  );
}

/** Ensure every selected sprint has a row in sprintProgress (in order). */
function normalizeSprintRows(dive: EpicDeepDive, sprintNames: string[]): EpicDeepDive {
  if (!sprintNames.length) return dive;
  const byName = new Map(dive.sprintProgress.map((s) => [s.sprintName, s]));
  const progress = sprintNames.map((name) => byName.get(name) ?? { sprintName: name, activities: "" });
  return { ...dive, sprintProgress: progress };
}

export default function SteeringPage() {
  const [sprintInput, setSprintInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<SteeringContent | null>(null);
  const [result, setResult] = useState<{ url: string; title: string } | null>(null);
  const [openDives, setOpenDives] = useState<Record<number, boolean>>({});

  // Epic selector state
  const [sprintIds, setSprintIds] = useState<string[]>([]);
  const [sprintNames, setSprintNames] = useState<string[]>([]);
  const [allEpics, setAllEpics] = useState<{ key: string; name: string }[]>([]);
  const [briefingLoading, setBriefingLoading] = useState<Record<number, boolean>>({});
  const [showEpicPicker, setShowEpicPicker] = useState(false);
  const epicPickerRef = useRef<HTMLDivElement>(null);

  async function handleAnalyze() {
    const ids = sprintInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) { setError("Enter at least one sprint ID"); return; }
    setAnalyzing(true); setError(null); setContent(null); setResult(null);
    setSprintIds(ids); setAllEpics([]); setSprintNames([]);
    try {
      const res = await fetch("/api/steering/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintIds: ids }),
      });
      const data = await res.json();
      if (data.success) {
        // Normalise every deep dive to have one row per sprint
        const sNames: string[] = data.sprintNames ?? [];
        setSprintNames(sNames);
        setAllEpics(data.epics ?? []);
        const normalised: SteeringContent = {
          ...data.content,
          epicDeepDives: (data.content.epicDeepDives as EpicDeepDive[]).map((d) =>
            normalizeSprintRows(d, sNames)
          ),
        };
        setContent(normalised);
        const openState: Record<number, boolean> = {};
        normalised.epicDeepDives.forEach((_: unknown, i: number) => { openState[i] = true; });
        setOpenDives(openState);
      } else {
        setError(data.error || "Analysis failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCreate() {
    if (!content) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/steering/create-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ url: data.url, title: data.title });
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        setError(data.error || "Page creation failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  /** Run AI briefing for a specific deep dive index. */
  async function handleBriefDive(diveIndex: number) {
    if (!content) return;
    const dive = content.epicDeepDives[diveIndex];
    setBriefingLoading((prev) => ({ ...prev, [diveIndex]: true }));
    setError(null);
    try {
      const res = await fetch("/api/steering/epic-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey: dive.epicKey, epicName: dive.epicName, sprintIds }),
      });
      const data = await res.json();
      if (data.success) {
        const briefed = normalizeSprintRows(data.epicDeepDive as EpicDeepDive, sprintNames);
        updateDive(diveIndex, briefed);
      } else {
        setError(data.error || "Epic briefing failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBriefingLoading((prev) => ({ ...prev, [diveIndex]: false }));
    }
  }

  /** Add a new epic deep dive for the chosen epic and immediately brief it. */
  async function handleAddEpic(epicKey: string, epicName: string) {
    if (!content) return;
    setShowEpicPicker(false);

    // Create a stub dive and append it
    const stub: EpicDeepDive = {
      epicKey,
      epicName,
      intro: "",
      sprintProgress: sprintNames.map((name) => ({ sprintName: name, activities: "" })),
      challenges: [],
    };
    const newDives = [...content.epicDeepDives, stub];
    const newIndex = newDives.length - 1;
    setContent({ ...content, epicDeepDives: newDives });
    setOpenDives((o) => ({ ...o, [newIndex]: true }));

    // Immediately run the AI briefing for it
    setBriefingLoading((prev) => ({ ...prev, [newIndex]: true }));
    setError(null);
    try {
      const res = await fetch("/api/steering/epic-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicKey, epicName, sprintIds }),
      });
      const data = await res.json();
      if (data.success) {
        const briefed = normalizeSprintRows(data.epicDeepDive as EpicDeepDive, sprintNames);
        setContent((prev) => {
          if (!prev) return prev;
          const dives = [...prev.epicDeepDives];
          dives[newIndex] = briefed;
          return { ...prev, epicDeepDives: dives };
        });
      } else {
        setError(data.error || "Epic briefing failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBriefingLoading((prev) => ({ ...prev, [newIndex]: false }));
    }
  }

  // ── Content helpers ───────────────────────────────────────────────────────
  const [draggedRowIdx, setDraggedRowIdx] = useState<number | null>(null);
  const [dragOverRowIdx, setDragOverRowIdx] = useState<number | null>(null);

  function handleRowDragStart(e: React.DragEvent, index: number) {
    setDraggedRowIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  }

  function handleRowDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverRowIdx !== index) {
      setDragOverRowIdx(index);
    }
  }

  function handleRowDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedRowIdx === null || draggedRowIdx === targetIndex || !content) {
      setDraggedRowIdx(null);
      setDragOverRowIdx(null);
      return;
    }
    const updated = [...content.executiveSummary];
    const [moved] = updated.splice(draggedRowIdx, 1);
    updated.splice(targetIndex, 0, moved);
    setContent({ ...content, executiveSummary: updated });
    setDraggedRowIdx(null);
    setDragOverRowIdx(null);
  }

  function handleRowDragEnd() {
    setDraggedRowIdx(null);
    setDragOverRowIdx(null);
  }

  function updateRow(i: number, patch: Partial<SummaryRow>) {
    if (!content) return;
    const rows = [...content.executiveSummary];
    rows[i] = { ...rows[i], ...patch };
    setContent({ ...content, executiveSummary: rows });
  }
  function addRow() {
    if (!content) return;
    setContent({ ...content, executiveSummary: [...content.executiveSummary, { feature: "", description: "", status: "on-track" }] });
  }
  function removeRow(i: number) {
    if (!content) return;
    setContent({ ...content, executiveSummary: content.executiveSummary.filter((_, idx) => idx !== i) });
  }

  function updateDive(i: number, patch: Partial<EpicDeepDive>) {
    if (!content) return;
    const dives = [...content.epicDeepDives];
    dives[i] = { ...dives[i], ...patch };
    setContent({ ...content, epicDeepDives: dives });
  }
  function removeDive(i: number) {
    if (!content) return;
    const dives = content.epicDeepDives.filter((_, idx) => idx !== i);
    setContent({ ...content, epicDeepDives: dives });
    const openState: Record<number, boolean> = {};
    dives.forEach((_, idx) => { openState[idx] = openDives[idx < i ? idx : idx + 1] ?? false; });
    setOpenDives(openState);
  }

  function updateWorkstream(i: number, patch: Partial<Workstream>) {
    if (!content) return;
    const ws = [...content.otherWorkstreams];
    ws[i] = { ...ws[i], ...patch };
    setContent({ ...content, otherWorkstreams: ws });
  }
  function removeWorkstream(i: number) {
    if (!content) return;
    setContent({
      ...content,
      otherWorkstreams: content.otherWorkstreams.filter((_, idx) => idx !== i),
    });
  }
  function addWorkstream() {
    if (!content) return;
    setContent({
      ...content,
      otherWorkstreams: [...content.otherWorkstreams, { title: "", bullets: [""] }],
    });
  }

  // Epics already in deep dives — excluded from picker
  const usedEpicKeys = new Set(content?.epicDeepDives.map((d) => d.epicKey) ?? []);
  const availableEpics = allEpics.filter((e) => !usedEpicKeys.has(e.key));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Brain className="text-purple-500" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">Steering Meeting Agenda</h1>
      </div>
      <p className="text-gray-500 mb-8 text-sm">
        Enter sprint IDs, let the AI analyse and summarise them, review &amp; edit the output, then publish to Confluence.
      </p>

      {/* Input */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sprint IDs
          <span className="ml-2 text-xs text-gray-400 font-normal">(comma-separated, e.g. 42, 43, 44)</span>
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="e.g. 42, 43, 44, 45, 46"
            value={sprintInput}
            onChange={(e) => setSprintInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !sprintInput.trim()}
            className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Brain size={15} />}
            {analyzing ? "Analysing…" : "Analyse Sprints"}
          </button>
        </div>
        {analyzing && (
          <p className="mt-3 text-xs text-gray-400 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            Fetching sprint data and running AI analysis — this may take 30–60 seconds…
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
          <CheckCircle size={16} />
          <div className="flex-1">
            <span className="font-medium">Page created!</span> {result.title}
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-medium underline hover:text-green-900 whitespace-nowrap"
          >
            Open in Confluence <ExternalLink size={13} />
          </a>
        </div>
      )}

      {content && (
        <>
          {/* Sprint range badge */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs bg-purple-100 text-purple-700 font-medium px-3 py-1 rounded-full">
              {content.sprintRange}
            </span>
            {sprintNames.length > 0 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                {sprintNames.length} sprint{sprintNames.length !== 1 ? "s" : ""}
              </span>
            )}
            <span className="text-xs text-gray-400">AI-generated — review and edit before publishing</span>
          </div>

          {/* Summary intro */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
              Summary Introduction
            </h3>
            <EditableText
              value={content.summaryIntro}
              onChange={(v) => setContent({ ...content, summaryIntro: v })}
              multiline
            />
          </div>

          {/* Executive Summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                1. Executive Summary
              </h3>
              <button onClick={addRow} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                <Plus size={12} /> Add row
              </button>
            </div>
            <div className="space-y-2">
              {content.executiveSummary.map((row, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={(e) => handleRowDragStart(e, i)}
                  onDragOver={(e) => handleRowDragOver(e, i)}
                  onDrop={(e) => handleRowDrop(e, i)}
                  onDragEnd={handleRowDragEnd}
                  className={`flex items-start gap-2 p-2 border rounded-lg transition-all ${
                    draggedRowIdx === i
                      ? "opacity-40 bg-gray-50 border-dashed border-gray-400"
                      : dragOverRowIdx === i
                      ? "border-purple-400 bg-purple-50/50 shadow-sm"
                      : "border-gray-100 hover:border-gray-200 bg-white"
                  }`}
                >
                  <div
                    className="text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing p-1 mt-1 transition flex-shrink-0"
                    title="Drag to reposition"
                  >
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <EditableText value={row.feature} onChange={(v) => updateRow(i, { feature: v })} />
                    <EditableText value={row.description} onChange={(v) => updateRow(i, { description: v })} />
                  </div>
                  <StatusSelect value={row.status} onChange={(v) => updateRow(i, { status: v })} />
                  <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-500 mt-1 transition" title="Delete row">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Epic Deep Dives ──────────────────────────────────────────── */}
          {content.epicDeepDives.map((dive, i) => (
            <div key={`${dive.epicKey}-${i}`} className="bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <button
                  onClick={() => setOpenDives((o) => ({ ...o, [i]: !o[i] }))}
                  className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition"
                >
                  {openDives[i] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                    {i + 2}. {dive.epicName} — Deep Dive
                  </span>
                  <span className="text-xs text-gray-400 font-mono">{dive.epicKey}</span>
                  {dive.sprintProgress.length > 0 && (
                    <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full ml-1">
                      {dive.sprintProgress.length} sprint{dive.sprintProgress.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </button>
                {/* AI Briefing button */}
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={() => handleBriefDive(i)}
                    disabled={briefingLoading[i] || !sprintIds.length}
                    title="Re-run AI briefing for this epic"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 transition"
                  >
                    {briefingLoading[i]
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Sparkles size={12} />}
                    {briefingLoading[i] ? "Briefing…" : "AI Briefing"}
                  </button>
                  <button
                    onClick={() => removeDive(i)}
                    className="text-gray-300 hover:text-red-500 transition"
                    title="Remove deep dive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {openDives[i] && (
                <div className="p-5 space-y-5">
                  {/* Loading overlay for briefing */}
                  {briefingLoading[i] && (
                    <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                      <Loader2 size={13} className="animate-spin" />
                      Running AI briefing for <strong>{dive.epicName}</strong> — this may take 20–40 seconds…
                    </div>
                  )}

                  {/* Introduction */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Introduction</label>
                    <EditableText
                      value={dive.intro}
                      onChange={(v) => updateDive(i, { intro: v })}
                      multiline
                    />
                  </div>

                  {/* Progress by Sprint */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs text-gray-400">
                        Progress by Sprint
                        <span className="ml-2 text-gray-300">({dive.sprintProgress.length} row{dive.sprintProgress.length !== 1 ? "s" : ""})</span>
                      </label>
                    </div>
                    <div className="space-y-2">
                      {dive.sprintProgress.map((sp, j) => (
                        <div key={j} className="grid grid-cols-3 gap-2 items-start">
                          <EditableText
                            value={sp.sprintName}
                            onChange={(v) => {
                              const p = [...dive.sprintProgress];
                              p[j] = { ...p[j], sprintName: v };
                              updateDive(i, { sprintProgress: p });
                            }}
                          />
                          <div className="col-span-2 flex gap-2 items-start">
                            <div className="flex-1">
                              <EditableText
                                value={sp.activities}
                                onChange={(v) => {
                                  const p = [...dive.sprintProgress];
                                  p[j] = { ...p[j], activities: v };
                                  updateDive(i, { sprintProgress: p });
                                }}
                                multiline
                              />
                            </div>
                            <button
                              onClick={() => {
                                const p = dive.sprintProgress.filter((_, idx) => idx !== j);
                                updateDive(i, { sprintProgress: p });
                              }}
                              className="text-gray-300 hover:text-red-500 mt-1 flex-shrink-0"
                              title="Remove sprint row"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          updateDive(i, {
                            sprintProgress: [...dive.sprintProgress, { sprintName: "", activities: "" }],
                          })
                        }
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Plus size={12} /> Add sprint row
                      </button>
                    </div>
                  </div>

                  {/* Challenges */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-2">Challenges / Hiccups</label>
                    <div className="space-y-2">
                      {dive.challenges.map((c, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">•</span>
                          <div className="flex-1">
                            <EditableText
                              value={c}
                              onChange={(v) => {
                                const ch = [...dive.challenges];
                                ch[j] = v;
                                updateDive(i, { challenges: ch });
                              }}
                            />
                          </div>
                          <button
                            onClick={() => {
                              const ch = dive.challenges.filter((_, idx) => idx !== j);
                              updateDive(i, { challenges: ch });
                            }}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => updateDive(i, { challenges: [...dive.challenges, ""] })}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Plus size={12} /> Add challenge
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── Add Epic Deep Dive picker ───────────────────────────────── */}
          <div className="relative mb-4" ref={epicPickerRef}>
            <button
              onClick={() => setShowEpicPicker((v) => !v)}
              disabled={availableEpics.length === 0}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition w-full justify-center"
            >
              <Plus size={14} />
              Add Epic Deep Dive
              {availableEpics.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                  {availableEpics.length} available
                </span>
              )}
              {showEpicPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showEpicPicker && availableEpics.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-64 overflow-y-auto">
                <div className="p-2 border-b border-gray-100">
                  <p className="text-xs text-gray-400 px-2">Select an epic — AI will auto-brief it</p>
                </div>
                {availableEpics.map((epic) => (
                  <button
                    key={epic.key}
                    onClick={() => handleAddEpic(epic.key, epic.name)}
                    className="w-full text-left px-4 py-3 hover:bg-purple-50 transition flex items-center gap-3 border-b border-gray-50 last:border-0"
                  >
                    <Sparkles size={13} className="text-purple-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{epic.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{epic.key}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Other Workstreams */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                {content.epicDeepDives.length + 2}. Other Major Workstreams
              </h3>
              <button
                onClick={addWorkstream}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Plus size={12} /> Add workstream
              </button>
            </div>
            {content.otherWorkstreams.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">
                No workstreams remaining.
              </p>
            ) : (
              content.otherWorkstreams.map((ws, i) => (
                <div key={i} className="mb-5 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1">
                      <EditableText
                        value={ws.title}
                        onChange={(v) => updateWorkstream(i, { title: v })}
                        className="font-semibold"
                      />
                    </div>
                    <button
                      onClick={() => removeWorkstream(i)}
                      className="text-gray-300 hover:text-red-500 p-1 transition flex-shrink-0"
                      title="Delete entire workstream"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="ml-4 space-y-1 mt-2">
                    {ws.bullets.map((b, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <span className="text-gray-400">•</span>
                        <div className="flex-1">
                          <EditableText
                            value={b}
                            onChange={(v) => {
                              const bullets = [...ws.bullets];
                              bullets[j] = v;
                              updateWorkstream(i, { bullets });
                            }}
                          />
                        </div>
                        <button
                          onClick={() => updateWorkstream(i, { bullets: ws.bullets.filter((_, idx) => idx !== j) })}
                          className="text-gray-300 hover:text-red-500"
                          title="Delete bullet"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateWorkstream(i, { bullets: [...ws.bullets, ""] })}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <Plus size={12} /> Add bullet
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Collaboration */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              {content.epicDeepDives.length + 3}. Collaboration with Stakeholders
            </h3>
            <div className="space-y-2">
              {content.collaborationBullets.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-400">•</span>
                  <div className="flex-1">
                    <EditableText
                      value={b}
                      onChange={(v) => {
                        const bullets = [...content.collaborationBullets];
                        bullets[i] = v;
                        setContent({ ...content, collaborationBullets: bullets });
                      }}
                    />
                  </div>
                  <button
                    onClick={() =>
                      setContent({
                        ...content,
                        collaborationBullets: content.collaborationBullets.filter((_, idx) => idx !== i),
                      })
                    }
                    className="text-gray-300 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setContent({ ...content, collaborationBullets: [...content.collaborationBullets, ""] })}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Plus size={12} /> Add bullet
              </button>
            </div>
          </div>

          {/* Publish */}
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition text-sm"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {creating ? "Creating Confluence Page…" : "Create Confluence Page"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
