import { Mic, MicOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoiceButtonProps {
  isListening: boolean
  isSupported: boolean
  onClick: () => void
  className?: string
}

export function VoiceButton({
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

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-32 h-32 rounded-full transition-all duration-200",
        "flex flex-col items-center justify-center gap-2",
        "shadow-lg shadow-primary/30",
        "active:scale-95",
        isListening
          ? "bg-gradient-to-br from-secondary to-primary-dark animate-pulse"
          : "bg-gradient-to-br from-primary to-primary-dark hover:scale-105",
        className
      )}
    >
      <Mic className={cn(
        "w-12 h-12",
        isListening ? "text-white" : "text-white/90"
      )} />
      <span className="text-white text-sm font-medium">
        {isListening ? "Listening..." : "Tap to ask"}
      </span>
    </button>
  )
}
