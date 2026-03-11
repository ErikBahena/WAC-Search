import { ChevronRight } from "lucide-react"
import type { SearchResult } from "@/lib/intent-types"

interface RelatedSectionsProps {
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
}

export function RelatedSections({ results, onSelect }: RelatedSectionsProps) {
  if (results.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted">Other matching questions:</p>
      <div className="space-y-1">
        {results.map((result) => {
          const displayPath = result.chunk.subsectionPath && result.chunk.subsectionPath !== "overview"
            ? ` ${result.chunk.subsectionPath}`
            : ""
          const primaryLabel = result.question || `${result.chunk.sectionTitle}${displayPath}`
          return (
            <button
              key={result.chunk.chunkId}
              onClick={() => onSelect(result)}
              className="w-full flex items-center justify-between rounded-xl bg-white p-3 text-left transition-colors hover:bg-primary/5"
            >
              <div className="min-w-0 pr-2">
                <div className="text-sm text-text truncate">
                  {primaryLabel}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {result.chunk.sectionTitle}{displayPath}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
