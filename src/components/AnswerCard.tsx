import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExternalLink, Copy, Share2, ChevronDown, ChevronUp, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WacChunk } from "@/lib/search-qa"

interface AnswerCardProps {
  chunk: WacChunk
  score: number
  source?: "qa" | "content"
}

export function AnswerCard({ chunk, score, source }: AnswerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  // Adjust thresholds for EmbeddingGemma (scores tend to be higher)
  const isLowConfidence = score < 0.70
  const isVeryLowConfidence = score < 0.55

  const handleCopy = async () => {
    await navigator.clipboard.writeText(chunk.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `WAC ${chunk.id}`,
        text: chunk.sectionTitle,
        url: chunk.url,
      })
    } else {
      handleCopy()
    }
  }

  // The chunk content is already the specific answer
  const displayPath = chunk.subsectionPath && chunk.subsectionPath !== "overview"
    ? ` ${chunk.subsectionPath}`
    : ""

  return (
    <Card className={cn(
      "bg-white border-l-4 shadow-lg shadow-primary/10",
      isVeryLowConfidence ? "border-l-red-400" : isLowConfidence ? "border-l-warning" : "border-l-secondary"
    )}>
      <CardContent className="p-4 space-y-4">
        {isVeryLowConfidence ? (
          <div className="text-sm text-red-600 font-medium bg-red-50 px-3 py-2 rounded-lg">
            ⚠️ We couldn't find a strong match for your question. This is the closest result from the WAC regulations.
          </div>
        ) : isLowConfidence && (
          <div className="text-sm text-warning font-medium">
            This might not be an exact match
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="text-xs text-text-muted font-medium uppercase tracking-wide">
            {chunk.sectionTitle}{displayPath}
          </div>
          {source === "content" && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              From regulations
            </span>
          )}
        </div>

        <p className="text-text leading-relaxed">
          {chunk.content}
        </p>

        <a
          href={chunk.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 p-3 rounded-xl",
            "bg-gradient-to-r from-primary/20 to-secondary/20",
            "hover:from-primary/30 hover:to-secondary/30",
            "transition-colors"
          )}
        >
          <ExternalLink className="w-5 h-5 text-primary-dark" />
          <div>
            <div className="font-semibold text-primary-dark">View on WAC website</div>
            <div className="text-sm text-text-muted">WAC {chunk.id}</div>
          </div>
        </a>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="rounded-xl border-primary/30"
          >
            {copied ? (
              <Check className="w-4 h-4 mr-1 text-success" />
            ) : (
              <Copy className="w-4 h-4 mr-1" />
            )}
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="rounded-xl border-primary/30"
          >
            <Share2 className="w-4 h-4 mr-1" />
            Share
          </Button>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          {expanded ? "Hide" : "Show"} full section
        </button>

        {expanded && (
          <div className="p-3 bg-background rounded-xl text-sm leading-relaxed whitespace-pre-wrap">
            {chunk.fullContent}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
