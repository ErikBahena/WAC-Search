interface HeroProps {
  showFullContent: boolean
  onLearnMore: () => void
}

export function Hero({ showFullContent, onLearnMore }: HeroProps) {
  if (!showFullContent) {
    return (
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-primary-dark">
          WAC 110-300 Search
        </h1>
        <button
          onClick={onLearnMore}
          className="text-sm text-primary hover:text-primary-dark underline"
        >
          What is this?
        </button>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-primary-dark">
        WAC 110-300 Search
      </h1>
      <p className="text-lg text-text-muted">
        Washington State childcare regulations, searchable in plain English.
      </p>
      <div className="text-sm text-text-muted space-y-2">
        <p>
          <strong className="text-primary-dark">The problem:</strong> 300+ sections of dense legal text.
          Ctrl+F doesn't understand your question. You don't have time to dig.
        </p>
        <p>
          <strong className="text-primary-dark">The solution:</strong> Ask a question in your own words.
          Get the relevant regulation instantly.
        </p>
      </div>
    </div>
  )
}
