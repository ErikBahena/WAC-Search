import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExternalLink, Copy, Share2, ChevronDown, ChevronUp, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WacSection } from "@/lib/search"

interface AnswerCardProps {
  section: WacSection
  score: number
}

export function AnswerCard({ section, score }: AnswerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const isLowConfidence = score < 0.5

  const handleCopy = async () => {
    await navigator.clipboard.writeText(section.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `WAC ${section.id}`,
        text: section.title,
        url: section.url,
      })
    } else {
      handleCopy()
    }
  }

  // Extract key answer from content (first meaningful paragraph)
  const keyAnswer = section.content
    .split("\n")
    .filter((line) => line.trim().length > 20)
    .slice(0, 2)
    .join(" ")
    .substring(0, 300)

  return (
    <Card className={cn(
      "bg-white border-l-4 shadow-lg shadow-primary/10",
      isLowConfidence ? "border-l-warning" : "border-l-secondary"
    )}>
      <CardContent className="p-4 space-y-4">
        {isLowConfidence && (
          <div className="text-sm text-warning font-medium">
            This might not be an exact match
          </div>
        )}

        <p className="text-text leading-relaxed">
          {keyAnswer}...
        </p>

        <a
          href={section.url}
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
            <div className="text-sm text-text-muted">WAC {section.id}</div>
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
          {expanded ? "Hide" : "Show"} full regulation text
        </button>

        {expanded && (
          <div className="p-3 bg-background rounded-xl text-sm leading-relaxed whitespace-pre-wrap">
            {section.content}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
