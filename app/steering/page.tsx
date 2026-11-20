"use client";
import { useState, useRef, useEffect } from "react";
import {
  FileText, Loader2, CheckCircle, AlertCircle, ExternalLink,
  Plus, Trash2, Brain, ChevronDown, ChevronRight, Sparkles, ChevronUp,
  GripVertical, Rocket, ListChecks, ArrowDown,
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

/** Extract numeric sprint IDs from comma/space separated text or Jira sprint URLs. */
function parseSprintIds(input: string): string[] {
  const ids = new Set<string>();
  // Match URLs with sprint or sprintId query param or /sprint/ path
  for (const m of input.matchAll(/(?:sprint(?:Id)?=|\/sprint\/)(\d+)/gi)) {
    if (m[1]) ids.add(m[1]);
  }

  // Tokenize plain input
  const tokens = input
    .replace(/(?:https?:\/\/\S+)/gi, " ")
    .replace(/sprint\s*/gi, " ")
    .split(/[, \n\t]+/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter((s) => /^\d+$/.test(s));

  for (const t of tokens) ids.add(t);
  return Array.from(ids);
}

export default function SteeringPage() {
  const [sprintInput, setSprintInput] = useState("");
  const [fetchingEpics, setFetchingEpics] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<SteeringContent | null>(null);
  const [result, setResult] = useState<{ url: string; title: string } | null>(null);
  const [openDives, setOpenDives] = useState<Record<string, boolean>>({});

  // Epic selector & pre-selection state
  const [sprintIds, setSprintIds] = useState<string[]>([]);
  const [sprintNames, setSprintNames] = useState<string[]>([]);
  const [allEpics, setAllEpics] = useState<{ key: string; name: string }[]>([]);
  const [discoveredEpics, setDiscoveredEpics] = useState<{ key: string; name: string; issueCount?: number }[]>([]);
  const [selectedEpicKeys, setSelectedEpicKeys] = useState<string[]>([]);
  const [step, setStep] = useState<"input" | "select-epics" | "analyzed">("input");
  const [briefingLoading, setBriefingLoading] = useState<Record<string, boolean>>({});
  const [showEpicPicker, setShowEpicPicker] = useState(false);
  const [draggedEpicIdx, setDraggedEpicIdx] = useState<number | null>(null);
  const [dragOverEpicIdx, setDragOverEpicIdx] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [initialLoaded, setInitialLoaded] = useState(false);
  const epicPickerRef = useRef<HTMLDivElement>(null);

  // ── Temporary memory: restore on page mount/refresh ────────────────────────
  useEffect(() => {
    fetch("/api/temp-memory?key=steering")
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          const d = res.data;
          if (typeof d.sprintInput === "string") setSprintInput(d.sprintInput);
          if (Array.isArray(d.sprintIds)) setSprintIds(d.sprintIds);
          if (Array.isArray(d.sprintNames)) setSprintNames(d.sprintNames);
          if (Array.isArray(d.allEpics)) setAllEpics(d.allEpics);
          if (Array.isArray(d.discoveredEpics)) setDiscoveredEpics(d.discoveredEpics);
          if (Array.isArray(d.selectedEpicKeys)) setSelectedEpicKeys(d.selectedEpicKeys);
          if (d.content) {
            setContent(d.content);
            setStep("analyzed");
          } else if (Array.isArray(d.discoveredEpics) && d.discoveredEpics.length > 0) {
            setStep("select-epics");
          } else if (d.step) {
            setStep(d.step);
          }
          if (d.openDives) setOpenDives(d.openDives);
          if (d.result) setResult(d.result);
        }
      })
      .catch(() => {})
      .finally(() => {
        setInitialLoaded(true);
      });
  }, []);

  // ── Temporary memory: autosave while application is running ────────────────
  useEffect(() => {
    if (!initialLoaded) return;
    if (!content && !sprintInput.trim() && discoveredEpics.length === 0) return;

    setSaveStatus("saving");
    const timer = setTimeout(() => {
      fetch("/api/temp-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "steering",
          data: {
            sprintInput,
            sprintIds,
            sprintNames,
            allEpics,
            discoveredEpics,
            selectedEpicKeys,
            step,
            content,
            openDives,
            result,
            savedAt: Date.now(),
          },
        }),
      })
        .then(() => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        })
        .catch(() => setSaveStatus("idle"));
    }, 600);

    return () => clearTimeout(timer);
  }, [
    initialLoaded,
    content,
    sprintInput,
    sprintIds,
    sprintNames,
    allEpics,
    discoveredEpics,
    selectedEpicKeys,
    step,
    openDives,
    result,
  ]);

  async function handleClearDraft() {
    setContent(null);
    setSprintInput("");
    setSprintIds([]);
    setSprintNames([]);
    setAllEpics([]);
    setDiscoveredEpics([]);
    setSelectedEpicKeys([]);
    setStep("input");
    setResult(null);
    setOpenDives({});
    setError(null);
    setSaveStatus("idle");
    try {
      await fetch("/api/temp-memory?key=steering", { method: "DELETE" });
    } catch {
      // silent
    }
  }

  /** Step 1: Fetch epics from Jira without running AI */
  async function handleFetchEpics() {
    const ids = parseSprintIds(sprintInput);
    if (!ids.length) {
      setError("Enter at least one sprint ID or Jira sprint link (e.g. 42, 43, 44)");
      return;
    }
    setFetchingEpics(true);
    setError(null);
    setContent(null);
    setResult(null);
    setSprintIds(ids);
    setAllEpics([]);
    setSprintNames([]);
    setDiscoveredEpics([]);
    setSelectedEpicKeys([]);

    try {
      const res = await fetch("/api/steering/epics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintIds: ids }),
      });
      const data = await res.json();
      if (data.success) {
        const dEpics = data.epics ?? [];
        setSprintNames(data.sprintNames ?? []);
        setDiscoveredEpics(dEpics);
        setAllEpics(dEpics.map((e: { key: string; name: string }) => ({ key: e.key, name: e.name })));
        if (!dEpics.length) {
          setError("No epics found in the specified sprint(s). Please verify the sprint IDs.");
        } else {
          setSelectedEpicKeys(dEpics.map((e: { key: string }) => e.key));
          setStep("select-epics");
        }
      } else {
        setError(data.error || "Failed to fetch epics from Jira");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setFetchingEpics(false);
    }
  }

  function toggleEpicSelection(key: string) {
    setSelectedEpicKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function selectAllEpics() {
    setSelectedEpicKeys(discoveredEpics.map((e) => e.key));
  }

  function deselectAllEpics() {
    setSelectedEpicKeys([]);
  }

  /** Step 2: Run AI analysis only for the selected epics */
  async function handleLetsGo() {
    if (!selectedEpicKeys.length) {
      setError("Please select at least one epic to deep dive into.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    setContent(null);
    setResult(null);

    try {
      const res = await fetch("/api/steering/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprintIds,
          selectedEpicKeys,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const sNames: string[] = data.sprintNames ?? sprintNames;
        setSprintNames(sNames);
        setAllEpics(data.epics ?? allEpics);
        const normalised: SteeringContent = {
          ...data.content,
          epicDeepDives: (data.content.epicDeepDives as EpicDeepDive[]).map((d) =>
            normalizeSprintRows(d, sNames)
          ),
        };
        setContent(normalised);
        const openState: Record<string, boolean> = {};
        normalised.epicDeepDives.forEach((d) => {
          openState[d.epicKey] = true;
        });
        setOpenDives(openState);
        setStep("analyzed");
      } else {
        setError(data.error || "AI analysis failed");
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

  /** Run AI briefing for a specific deep dive. */
  async function handleBriefDive(diveIndex: number) {
    if (!content) return;
    const dive = content.epicDeepDives[diveIndex];
    if (!dive) return;
    setBriefingLoading((prev) => ({ ...prev, [dive.epicKey]: true }));
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
        setContent((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            epicDeepDives: prev.epicDeepDives.map((d) => (d.epicKey === dive.epicKey ? briefed : d)),
          };
        });
      } else {
        setError(data.error || "Epic briefing failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBriefingLoading((prev) => ({ ...prev, [dive.epicKey]: false }));
    }
  }

  /** Add a new epic deep dive for the chosen epic, create an executive summary row, and immediately brief it. */
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

    // Automatically create a new row in executive summary for that epic
    const alreadyInSummary = content.executiveSummary.some(
      (r) =>
        r.feature.toLowerCase().trim() === epicName.toLowerCase().trim() ||
        (epicKey && r.feature.includes(epicKey))
    );
    const updatedSummary = alreadyInSummary
      ? content.executiveSummary
      : [
          ...content.executiveSummary,
          { feature: epicName, description: "", status: "on-track" as StatusType },
        ];

    setContent({
      ...content,
      epicDeepDives: newDives,
      executiveSummary: updatedSummary,
    });
    setOpenDives((o) => ({ ...o, [epicKey]: true }));

    // Immediately run the AI briefing for it
    setBriefingLoading((prev) => ({ ...prev, [epicKey]: true }));
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
          const dives = prev.epicDeepDives.map((d) => (d.epicKey === epicKey ? briefed : d));
          // Auto-populate the description of the corresponding executive summary row if empty
          const exec = prev.executiveSummary.map((r) => {
            const matchesEpic =
              r.feature.toLowerCase().trim() === epicName.toLowerCase().trim() ||
              (epicKey && r.feature.includes(epicKey));
            if (matchesEpic && !r.description) {
              return {
                ...r,
                description: briefed.intro,
                status: briefed.challenges.length > 0 ? ("managed-risk" as StatusType) : r.status,
              };
            }
            return r;
          });
          return { ...prev, epicDeepDives: dives, executiveSummary: exec };
        });
      } else {
        setError(data.error || "Epic briefing failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBriefingLoading((prev) => ({ ...prev, [epicKey]: false }));
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
    const removedKey = content.epicDeepDives[i]?.epicKey;
    const dives = content.epicDeepDives.filter((_, idx) => idx !== i);
    setContent({ ...content, epicDeepDives: dives });
    if (removedKey) {
      setOpenDives((o) => {
        const next = { ...o };
        delete next[removedKey];
        return next;
      });
    }
  }

  function handleEpicDragStart(e: React.DragEvent, index: number) {
    const target = e.target as HTMLElement;
    if (
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) ||
      target.closest("button, input, textarea, select")
    ) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);

    // Create a compact custom drag image so the cursor isn't dragging a huge expanded box
    const dive = content?.epicDeepDives[index];
    if (dive) {
      const ghost = document.createElement("div");
      ghost.style.position = "fixed";
      ghost.style.top = "-1000px";
      ghost.style.left = "-1000px";
      ghost.style.padding = "8px 14px";
      ghost.style.borderRadius = "8px";
      ghost.style.backgroundColor = "#ffffff";
      ghost.style.border = "2px solid #7c3aed";
      ghost.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.25)";
      ghost.style.fontWeight = "600";
      ghost.style.fontSize = "12px";
      ghost.style.color = "#1f2937";
      ghost.style.display = "flex";
      ghost.style.alignItems = "center";
      ghost.style.gap = "8px";
      ghost.style.zIndex = "99999";
      ghost.innerHTML = `
        <span style="color: #6b7280; font-size: 14px;">⋮⋮</span>
        <span>${index + 2}. ${dive.epicName}</span>
        <span style="font-family: monospace; font-size: 10px; background: #f3e8ff; color: #7e22ce; padding: 2px 6px; border-radius: 4px; font-weight: normal;">${dive.epicKey}</span>
      `;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 20, 18);
      setTimeout(() => {
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      }, 0);
    }

    setDraggedEpicIdx(index);
  }

  function handleEpicDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverEpicIdx !== index) {
      setDragOverEpicIdx(index);
    }
  }

  function handleEpicDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedEpicIdx === null || !content) {
      setDraggedEpicIdx(null);
      setDragOverEpicIdx(null);
      return;
    }
    if (draggedEpicIdx === targetIndex) {
      setDraggedEpicIdx(null);
      setDragOverEpicIdx(null);
      return;
    }
    const updated = [...content.epicDeepDives];
    const [moved] = updated.splice(draggedEpicIdx, 1);
    if (targetIndex >= updated.length) {
      updated.push(moved);
    } else {
      updated.splice(targetIndex, 0, moved);
    }
    setContent({ ...content, epicDeepDives: updated });
    setDraggedEpicIdx(null);
    setDragOverEpicIdx(null);
  }

  function handleEpicDragEnd() {
    setDraggedEpicIdx(null);
    setDragOverEpicIdx(null);
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

  const isDraggingAnyEpic = draggedEpicIdx !== null;
  const otherWorkstreamsSectionNum = content ? content.epicDeepDives.length + 2 : 2;
  const collabSectionNum = content
    ? content.epicDeepDives.length + 2 + (content.hideOtherWorkstreams ? 0 : 1)
    : 3;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Brain className="text-purple-500" size={24} />
          <h1 className="text-2xl font-bold text-gray-900">Steering Meeting Agenda</h1>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-100">
              <Loader2 size={12} className="animate-spin" /> Autosaving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
              <CheckCircle size={12} /> Autosaved
            </span>
          )}
          {(content || sprintInput.trim()) && (
            <button
              onClick={handleClearDraft}
              className="text-xs text-gray-400 hover:text-red-500 transition underline"
              title="Discard temporary saved data"
            >
              Clear draft
            </button>
          )}
        </div>
      </div>
      <p className="text-gray-500 mb-8 text-sm">
        Enter sprint IDs or links, select which epics to deep dive, let AI analyse and summarise them, review &amp; edit the output, then publish to Confluence.
      </p>

      {/* Step 1: Input */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sprint IDs or Jira Sprint Links
          <span className="ml-2 text-xs text-gray-400 font-normal">
            (comma or space-separated, e.g. 42, 43, 44 or paste Jira sprint/board URLs)
          </span>
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="e.g. 42, 43, 44 or paste Jira sprint URLs"
            value={sprintInput}
            onChange={(e) => setSprintInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !fetchingEpics && handleFetchEpics()}
            disabled={fetchingEpics || analyzing}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
          <button
            onClick={handleFetchEpics}
            disabled={fetchingEpics || !sprintInput.trim() || analyzing}
            className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {fetchingEpics ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}
            {fetchingEpics ? "Fetching Epics…" : discoveredEpics.length > 0 ? "Re-fetch Epics" : "Fetch Epics"}
          </button>
        </div>
        {fetchingEpics && (
          <p className="mt-3 text-xs text-purple-600 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            Fetching epics directly from Jira (0 AI tokens used)…
          </p>
        )}
      </div>

      {/* Step 2: Epic Selection Checklist */}
      {discoveredEpics.length > 0 && !content && (
        <div className="bg-white border border-purple-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                  2
                </span>
                <h3 className="text-base font-semibold text-gray-900">
                  Select Epics for Deep Dive
                </h3>
                <span className="text-xs bg-purple-100 text-purple-800 font-semibold px-2.5 py-0.5 rounded-full">
                  {selectedEpicKeys.length} of {discoveredEpics.length} selected
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-8">
                Choose which epics to deep dive into with AI. Unselected epics will be grouped into summary workstreams to save AI credits.
              </p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto ml-8 sm:ml-0">
              <button
                type="button"
                onClick={selectAllEpics}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium px-2.5 py-1 rounded hover:bg-purple-50 transition border border-purple-200"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAllEpics}
                className="text-xs text-gray-600 hover:text-gray-800 font-medium px-2.5 py-1 rounded hover:bg-gray-100 transition border border-gray-200"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Epics List */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {discoveredEpics.map((epic) => {
              const isSelected = selectedEpicKeys.includes(epic.key);
              return (
                <div
                  key={epic.key}
                  onClick={() => toggleEpicSelection(epic.key)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition select-none ${
                    isSelected
                      ? "border-purple-300 bg-purple-50/50 hover:bg-purple-50"
                      : "border-gray-200 bg-white hover:bg-gray-50 opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300 cursor-pointer pointer-events-none"
                  />
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                    {epic.key}
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-800">
                    {epic.name}
                  </span>
                  {typeof epic.issueCount === "number" && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {epic.issueCount} {epic.issueCount === 1 ? "issue" : "issues"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Action Bar */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-500">
              {selectedEpicKeys.length === 0 ? (
                <span className="text-amber-600 font-medium">⚠️ Select at least 1 epic to proceed</span>
              ) : (
                <span>
                  Ready to analyze <strong>{selectedEpicKeys.length}</strong> epic{selectedEpicKeys.length === 1 ? "" : "s"} across <strong>{sprintNames.length || sprintIds.length}</strong> sprint{sprintNames.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <button
              onClick={handleLetsGo}
              disabled={analyzing || selectedEpicKeys.length === 0}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium px-6 py-2.5 rounded-lg text-sm shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
              {analyzing ? "Analysing with AI…" : "Let's Go"}
            </button>
          </div>

          {analyzing && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin flex-shrink-0" />
              <span>
                Running AI analysis on {selectedEpicKeys.length} selected epic{selectedEpicKeys.length === 1 ? "" : "s"}… This may take 20–40 seconds.
              </span>
            </div>
          )}
        </div>
      )}

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-purple-100 text-purple-700 font-medium px-3 py-1 rounded-full">
                {content.sprintRange}
              </span>
              {sprintNames.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                  {sprintNames.length} sprint{sprintNames.length !== 1 ? "s" : ""}
                </span>
              )}
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full font-medium">
                {content.epicDeepDives.length} epic deep dive{content.epicDeepDives.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-gray-400">AI-generated — review and edit before publishing</span>
            </div>
            {discoveredEpics.length > 0 && (
              <button
                type="button"
                onClick={() => setContent(null)}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium underline flex items-center gap-1"
                title="Go back to epic checklist to select different epics and re-run"
              >
                ← Change epic selection
              </button>
            )}
          </div>

          {/* Summary intro */}
          <div className={`bg-white border border-gray-200 rounded-xl p-5 mb-4 transition-opacity duration-200 ${isDraggingAnyEpic ? "opacity-30 pointer-events-none" : ""}`}>
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
          <div className={`bg-white border border-gray-200 rounded-xl p-5 mb-4 transition-opacity duration-200 ${isDraggingAnyEpic ? "opacity-30 pointer-events-none" : ""}`}>
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              2. Epic Deep Dives ({content.epicDeepDives.length})
            </h3>
            <span className="text-xs text-gray-400">
              Drag by grip handle ⋮⋮ to reorder
            </span>
          </div>

          {isDraggingAnyEpic && draggedEpicIdx !== null && (
            <div className="mb-3 py-2 px-4 bg-purple-50 border border-purple-200 text-purple-900 rounded-lg text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="text-purple-600 animate-pulse" />
                <span>
                  Moving: <strong>{content.epicDeepDives[draggedEpicIdx]?.epicName}</strong>. Drag over any slot to place.
                </span>
              </div>
              <span className="text-[11px] text-purple-600 bg-purple-100 px-2 py-0.5 rounded font-medium">
                Release to place
              </span>
            </div>
          )}

          {content.epicDeepDives.map((dive, i) => {
            const isExpanded = !isDraggingAnyEpic && (openDives[dive.epicKey] ?? false);
            const isLoading = briefingLoading[dive.epicKey] ?? false;
            const isBeingDragged = draggedEpicIdx === i;
            const isDropTarget = dragOverEpicIdx === i && draggedEpicIdx !== null && draggedEpicIdx !== i;

            return (
              <div key={dive.epicKey} className="relative">
                {/* High-visibility insertion slot indicator above card */}
                {isDropTarget && (
                  <div className="relative my-2 py-1 transition-all duration-150 animate-in fade-in zoom-in-95">
                    <div className="h-1.5 w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 rounded-full shadow-lg ring-4 ring-purple-200 animate-pulse" />
                    <div className="absolute left-1/2 -translate-x-1/2 -top-2.5 z-10 bg-purple-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full shadow-md flex items-center gap-1.5 whitespace-nowrap">
                      <ArrowDown size={11} className="animate-bounce" />
                      <span>Place here (Position {i + 2})</span>
                    </div>
                  </div>
                )}

                <div
                  draggable
                  onDragStart={(e) => handleEpicDragStart(e, i)}
                  onDragOver={(e) => handleEpicDragOver(e, i)}
                  onDrop={(e) => handleEpicDrop(e, i)}
                  onDragEnd={handleEpicDragEnd}
                  className={`bg-white border rounded-xl mb-3 overflow-hidden transition-all duration-150 ${
                    isBeingDragged
                      ? "opacity-25 border-dashed border-2 border-purple-400 bg-purple-50/20 scale-[0.98]"
                      : isDropTarget
                      ? "border-2 border-purple-500 bg-purple-50/70 shadow-lg ring-4 ring-purple-100 scale-[1.01]"
                      : isDraggingAnyEpic
                      ? "opacity-50 border-gray-200 bg-white"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <div
                    className="text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing p-1 mr-1 transition flex-shrink-0"
                    title="Drag to reposition epic"
                  >
                    <GripVertical size={16} />
                  </div>
                  <button
                    onClick={() => setOpenDives((o) => ({ ...o, [dive.epicKey]: !o[dive.epicKey] }))}
                    className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition"
                  >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
                      disabled={isLoading || !sprintIds.length}
                      title="Re-run AI briefing for this epic"
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 transition"
                    >
                      {isLoading
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Sparkles size={12} />}
                      {isLoading ? "Briefing…" : "AI Briefing"}
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

                {isExpanded && (
                  <div className="p-5 space-y-5">
                    {/* Loading overlay for briefing */}
                    {isLoading && (
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
          </div>
        );
      })}

          {/* Bottom drop slot for placing at the very end of list */}
          {isDraggingAnyEpic && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverEpicIdx !== content.epicDeepDives.length) {
                  setDragOverEpicIdx(content.epicDeepDives.length);
                }
              }}
              onDrop={(e) => handleEpicDrop(e, content.epicDeepDives.length)}
              className={`border-2 border-dashed rounded-xl p-3.5 my-3 text-center transition-all cursor-pointer ${
                dragOverEpicIdx === content.epicDeepDives.length
                  ? "border-purple-600 bg-purple-100 text-purple-900 shadow-md ring-4 ring-purple-200 scale-[1.01]"
                  : "border-purple-200 bg-purple-50/50 text-purple-700 hover:border-purple-400"
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                <ArrowDown
                  size={14}
                  className={dragOverEpicIdx === content.epicDeepDives.length ? "animate-bounce" : ""}
                />
                <span>
                  {dragOverEpicIdx === content.epicDeepDives.length
                    ? `Place at end of list (Position ${content.epicDeepDives.length + 1})`
                    : "Drop here to move to end of list"}
                </span>
              </div>
            </div>
          )}

          {/* ── Sections below Epic Deep Dives (faded during epic reordering) ── */}
          <div className={`transition-opacity duration-200 ${isDraggingAnyEpic ? "opacity-30 pointer-events-none" : ""}`}>

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
          {content.hideOtherWorkstreams ? (
            <div className="mb-4">
              <button
                onClick={() =>
                  setContent({
                    ...content,
                    hideOtherWorkstreams: false,
                    otherWorkstreams:
                      content.otherWorkstreams && content.otherWorkstreams.length > 0
                        ? content.otherWorkstreams
                        : [{ title: "", bullets: [""] }],
                  })
                }
                className="flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600 transition w-full justify-center"
              >
                <Plus size={13} /> Add Other Major Workstreams
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  {otherWorkstreamsSectionNum}. Other Major Workstreams
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addWorkstream}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Plus size={12} /> Add workstream
                  </button>
                  <button
                    onClick={() => setContent({ ...content, hideOtherWorkstreams: true })}
                    className="text-gray-300 hover:text-red-500 p-1 transition"
                    title="Delete 'Other Major Workstreams' section"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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
          )}

          {/* Collaboration */}
          {content.hideCollaboration ? (
            <div className="mb-6">
              <button
                onClick={() =>
                  setContent({
                    ...content,
                    hideCollaboration: false,
                    collaborationBullets:
                      content.collaborationBullets && content.collaborationBullets.length > 0
                        ? content.collaborationBullets
                        : [""],
                  })
                }
                className="flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600 transition w-full justify-center"
              >
                <Plus size={13} /> Add Collaboration with Stakeholders
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  {collabSectionNum}. Collaboration with Stakeholders
                </h3>
                <button
                  onClick={() => setContent({ ...content, hideCollaboration: true })}
                  className="text-gray-300 hover:text-red-500 p-1 transition"
                  title="Delete 'Collaboration with Stakeholders' section"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-2">
                {content.collaborationBullets.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">
                    No collaboration bullets remaining.
                  </p>
                ) : (
                  content.collaborationBullets.map((b, i) => (
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
                        title="Delete bullet"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
                <button
                  onClick={() => setContent({ ...content, collaborationBullets: [...content.collaborationBullets, ""] })}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <Plus size={12} /> Add bullet
                </button>
              </div>
            </div>
          )}

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
        </div>
      </>
    )}
    </div>
  );
}
