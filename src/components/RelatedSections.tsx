import { ChevronRight } from "lucide-react"
import type { SearchResult } from "@/lib/search"

interface RelatedSectionsProps {
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
}

export function RelatedSections({ results, onSelect }: RelatedSectionsProps) {
  if (results.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted">Related sections:</p>
      <div className="space-y-1">
        {results.map((result) => (
          <button
            key={result.section.id}
            onClick={() => onSelect(result)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white hover:bg-primary/5 transition-colors text-left"
          >
            <span className="text-sm text-text truncate pr-2">
              {result.section.title}
            </span>
            <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
