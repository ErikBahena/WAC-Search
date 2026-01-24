import { Progress } from "@/components/ui/progress"

interface LoadingScreenProps {
  progress: number
}

export function LoadingScreen({ progress }: LoadingScreenProps) {
  const percentage = Math.round(progress * 100)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-6">
      <div className="text-4xl">✿</div>
      <h1 className="text-xl font-semibold text-primary-dark">
        Getting ready...
      </h1>
      <div className="w-full max-w-xs space-y-2">
        <Progress value={percentage} className="h-2" />
        <p className="text-center text-sm text-text-muted">
          {percentage}%
        </p>
      </div>
      <p className="text-sm text-text-muted text-center">
        First visit takes a moment
        <br />
        (cached for next time!)
      </p>
    </div>
  )
}
