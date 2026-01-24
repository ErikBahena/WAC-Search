import { quickQuestions } from "@/data/quick-questions"
import { cn } from "@/lib/utils"

interface QuickQuestionsProps {
  onSelect: (query: string) => void
  disabled?: boolean
}

export function QuickQuestions({ onSelect, disabled }: QuickQuestionsProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted text-center">Quick questions:</p>
      <div className="flex flex-wrap justify-center gap-2">
        {quickQuestions.map((q) => (
          <button
            key={q.label}
            onClick={() => onSelect(q.query)}
            disabled={disabled}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium",
              "bg-white border border-primary/30",
              "hover:bg-primary/10 hover:border-primary",
              "transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  )
}
