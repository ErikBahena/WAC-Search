import { Mic, MicOff, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoiceButtonProps {
  isStarting: boolean
  isListening: boolean
  isSupported: boolean
  onClick: () => void
  className?: string
}

export function VoiceButton({
  isStarting,
  isListening,
  isSupported,
  onClick,
  className,
}: VoiceButtonProps) {
  if (!isSupported) {
    return (
      <div className={cn(
        "w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center",
        className
      )}>
        <MicOff className="w-12 h-12 text-gray-400" />
      </div>
    )
  }

  // Starting: muted, spinner - clearly "wait"
  if (isStarting) {
    return (
      <div
        className={cn(
          "w-32 h-32 rounded-full",
          "flex flex-col items-center justify-center gap-2",
          "bg-primary/40 shadow-lg",
          className
        )}
      >
        <Loader2 className="w-10 h-10 text-primary-dark/60 animate-spin" />
        <span className="text-primary-dark/60 text-sm font-medium">
          Wait...
        </span>
      </div>
    )
  }

  // Listening: secondary purple, pulsing ring - "speak now"
  if (isListening) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-32 h-32 rounded-full transition-all duration-200",
          "flex flex-col items-center justify-center gap-2",
          "bg-gradient-to-br from-secondary to-purple-500",
          "shadow-xl shadow-secondary/50",
          "ring-4 ring-secondary/50 animate-pulse",
          "active:scale-95",
          className
        )}
      >
        <Mic className="w-12 h-12 text-white" />
        <span className="text-white text-sm font-semibold">
          Speak now
        </span>
      </button>
    )
  }

  // Idle: pink, ready to tap
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-32 h-32 rounded-full transition-all duration-200",
        "flex flex-col items-center justify-center gap-2",
        "shadow-lg shadow-primary/30",
        "active:scale-95",
        "bg-gradient-to-br from-primary to-primary-dark hover:scale-105",
        className
      )}
    >
      <Mic className="w-12 h-12 text-white/90" />
      <span className="text-white text-sm font-medium">
        Tap to ask
      </span>
    </button>
  )
}
