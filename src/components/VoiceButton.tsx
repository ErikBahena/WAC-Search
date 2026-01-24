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

  // Starting: gray, spinner, no pulse - clearly "wait"
  if (isStarting) {
    return (
      <div
        className={cn(
          "w-32 h-32 rounded-full",
          "flex flex-col items-center justify-center gap-2",
          "bg-gray-300 shadow-lg",
          className
        )}
      >
        <Loader2 className="w-12 h-12 text-gray-500 animate-spin" />
        <span className="text-gray-600 text-sm font-medium">
          Wait...
        </span>
      </div>
    )
  }

  // Listening: bright, pulsing, clearly "speak now"
  if (isListening) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-32 h-32 rounded-full transition-all duration-200",
          "flex flex-col items-center justify-center gap-2",
          "bg-gradient-to-br from-green-400 to-green-600",
          "shadow-lg shadow-green-500/50 animate-pulse",
          "active:scale-95",
          className
        )}
      >
        <Mic className="w-12 h-12 text-white" />
        <span className="text-white text-sm font-bold">
          Speak now!
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
