import { Search, Mic, Zap } from "lucide-react"

const features = [
  {
    icon: Search,
    title: "Semantic Search",
    description: "Ask questions in plain English. No need to know exact legal terminology.",
  },
  {
    icon: Mic,
    title: "Voice Input",
    description: "Tap to speak your question. Perfect when your hands are busy.",
  },
  {
    icon: Zap,
    title: "Instant Answers",
    description: "Find the relevant regulation in seconds, not minutes of scrolling.",
  },
]

export function FeatureCards() {
  return (
    <div className="grid gap-4 max-w-lg mx-auto">
      {features.map((feature) => (
        <div
          key={feature.title}
          className="flex items-start gap-4 p-4 rounded-xl bg-white border border-primary/20"
        >
          <div className="p-2 rounded-lg bg-primary/10 text-primary-dark">
            <feature.icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-primary-dark">{feature.title}</h3>
            <p className="text-sm text-text-muted">{feature.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
