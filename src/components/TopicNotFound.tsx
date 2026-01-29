import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Search, HelpCircle, BookOpen } from "lucide-react"

interface TopicNotFoundProps {
  query: string
  correctedQuery: string | null
  onBack: () => void
  onTryExample: (query: string) => void
}

const EXAMPLE_TOPICS = [
  { label: "Feeding & bottles", query: "How long can formula sit out?" },
  { label: "Sleep & naps", query: "Can babies sleep with blankets?" },
  { label: "Staff ratios", query: "How many infants per caregiver?" },
  { label: "Health & safety", query: "What temperature for a fever?" },
]

export function TopicNotFound({ query, correctedQuery, onBack, onTryExample }: TopicNotFoundProps) {
  return (
    <div className="min-h-screen bg-background p-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-primary-dark mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>

      <div className="max-w-lg mx-auto space-y-6">
        {/* Main message card */}
        <Card className="bg-white border-l-4 border-l-primary shadow-lg shadow-primary/10">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <HelpCircle className="w-6 h-6 text-primary-dark" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-text">
                  No matching regulation found
                </h2>
                <p className="text-text-muted">
                  We searched the Washington State childcare regulations but couldn't find specific rules about:
                </p>
                <p className="text-text font-medium bg-background px-3 py-2 rounded-lg">
                  "{query}"
                </p>
                {correctedQuery && correctedQuery !== query && (
                  <p className="text-sm text-text-muted">
                    (Also searched for: "{correctedQuery}")
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suggestions card */}
        <Card className="bg-white shadow-md">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-text">
              <BookOpen className="w-5 h-5 text-secondary" />
              <h3 className="font-semibold">Topics we can help with</h3>
            </div>
            <p className="text-sm text-text-muted">
              The WAC regulations cover childcare licensing requirements including:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EXAMPLE_TOPICS.map((topic) => (
                <button
                  key={topic.label}
                  onClick={() => onTryExample(topic.query)}
                  className="flex items-center gap-2 p-3 text-left rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 hover:from-primary/20 hover:to-secondary/20 transition-colors"
                >
                  <Search className="w-4 h-4 text-primary-dark shrink-0" />
                  <span className="text-sm text-text">{topic.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <div className="text-center space-y-3">
          <p className="text-sm text-text-muted">
            Try rephrasing your question or using different keywords
          </p>
          <Button
            variant="outline"
            onClick={onBack}
            className="rounded-xl border-primary/30"
          >
            <Search className="w-4 h-4 mr-2" />
            Ask a different question
          </Button>
        </div>
      </div>
    </div>
  )
}
