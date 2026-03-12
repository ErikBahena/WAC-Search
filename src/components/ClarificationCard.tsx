import { ArrowLeft, HelpCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { SearchClarification } from "@/lib/intent-types"

interface ClarificationCardProps {
  query: string
  clarification: SearchClarification
  onBack: () => void
  onChoose: (query: string) => void
}

export function ClarificationCard({
  query,
  clarification,
  onBack,
  onChoose,
}: ClarificationCardProps) {
  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-primary-dark"
      >
        <ArrowLeft className="h-5 w-5" />
        New question
      </button>

      <div className="mx-auto max-w-lg space-y-4">
        <p className="text-text-muted italic">"{query}"</p>

        <Card className="border-l-4 border-l-secondary bg-white shadow-lg shadow-primary/10">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-secondary/10 p-3 text-secondary shrink-0">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Clarify question
                </div>
                <h2 className="text-lg font-semibold leading-tight text-text">
                  {clarification.question}
                </h2>
                <p className="text-sm leading-relaxed text-text-muted">
                  This query could match more than one regulation path. Pick the one you mean.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {clarification.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => onChoose(option.query)}
                  className="w-full rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-secondary/10 p-4 text-left transition-colors hover:from-primary/20 hover:to-secondary/20"
                >
                  <div className="font-semibold text-text">{option.label}</div>
                  {option.description ? (
                    <div className="mt-1 text-sm leading-relaxed text-text-muted">
                      {option.description}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
