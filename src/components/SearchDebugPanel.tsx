import type { SearchDebugInfo } from "@/lib/intent-types"

interface SearchDebugPanelProps {
  debug: SearchDebugInfo | null
}

function formatScore(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a"
  }
  return value.toFixed(3)
}

export function SearchDebugPanel({ debug }: SearchDebugPanelProps) {
  if (!import.meta.env.DEV || !debug) {
    return null
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold uppercase tracking-wide text-slate-900">Search Debug</p>
          <p className="mt-1 break-all text-[11px] text-slate-600">{debug.normalizedQuery}</p>
        </div>
        <div className="rounded-md bg-white px-2 py-1 font-medium text-slate-900">
          {debug.engine}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded-md bg-white p-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Top Label</p>
          <p className="mt-1 font-medium text-slate-900">{debug.topLabel || "n/a"}</p>
        </div>
        <div className="rounded-md bg-white p-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Confidence</p>
          <p className="mt-1 font-medium text-slate-900">{formatScore(debug.confidence)}</p>
        </div>
        <div className="rounded-md bg-white p-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Margin</p>
          <p className="mt-1 font-medium text-slate-900">{formatScore(debug.margin)}</p>
        </div>
        <div className="rounded-md bg-white p-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Reason</p>
          <p className="mt-1 font-medium text-slate-900">{debug.reason || "matched"}</p>
        </div>
      </div>

      {debug.topSections && debug.topSections.length > 0 ? (
        <div className="mt-3">
          <p className="font-semibold text-slate-900">Top Sections</p>
          <div className="mt-2 space-y-1">
            {debug.topSections.map((section) => (
              <div key={section.label} className="flex items-center justify-between rounded-md bg-white px-2 py-1">
                <span className="font-mono text-[11px] text-slate-700">{section.label}</span>
                <span className="font-medium text-slate-900">{formatScore(section.confidence)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {debug.topCandidates && debug.topCandidates.length > 0 ? (
        <div className="mt-3">
          <p className="font-semibold text-slate-900">Top Candidates</p>
          <div className="mt-2 space-y-2">
            {debug.topCandidates.map((candidate) => (
              <div key={`${candidate.qaId}-${candidate.url}`} className="rounded-md bg-white px-2 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] text-slate-600">{candidate.qaId}</span>
                  <span className="font-medium text-slate-900">{formatScore(candidate.score)}</span>
                </div>
                <p className="mt-1 text-slate-800">{candidate.question}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{candidate.sectionId}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
