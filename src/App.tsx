import { useState, useEffect } from "react"
import { useSearch } from "@/hooks/useSearch"
import { useVoice } from "@/hooks/useVoice"
import type { SearchResult } from "@/lib/search"
import { VoiceButton } from "@/components/VoiceButton"
import { SearchInput } from "@/components/SearchInput"
import { AnswerCard } from "@/components/AnswerCard"
import { QuickQuestions } from "@/components/QuickQuestions"
import { RelatedSections } from "@/components/RelatedSections"
import { Disclaimer } from "@/components/Disclaimer"
import { LoadingScreen } from "@/components/LoadingScreen"
import { ArrowLeft } from "lucide-react"

function App() {
  const { isLoading, isReady, progress, results, doSearch } = useSearch()
  const {
    isSupported,
    isStarting,
    isListening,
    transcript,
    startListening,
    stopListening,
  } = useVoice()

  const [currentQuery, setCurrentQuery] = useState("")
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

  // Auto-search when voice transcript is finalized
  useEffect(() => {
    if (transcript && !isListening) {
      setCurrentQuery(transcript)
      doSearch(transcript)
    }
  }, [transcript, isListening, doSearch])

  const handleSearch = (query: string) => {
    setCurrentQuery(query)
    setSelectedResult(null)
    doSearch(query)
  }

  const handleBack = () => {
    setCurrentQuery("")
    setSelectedResult(null)
  }

  const handleSelectRelated = (result: SearchResult) => {
    setSelectedResult(result)
  }

  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  if (isLoading) {
    return <LoadingScreen progress={progress} />
  }

  const primaryResult = selectedResult || results[0]
  const relatedResults = selectedResult
    ? results.filter((r) => r.section.id !== selectedResult.section.id)
    : results.slice(1)

  // Results view
  if (currentQuery && results.length > 0) {
    return (
      <div className="min-h-screen bg-background p-4 pb-24">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-primary-dark mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          New question
        </button>

        <div className="space-y-4 max-w-lg mx-auto">
          <p className="text-text-muted italic">"{currentQuery}"</p>

          {primaryResult && (
            <AnswerCard
              section={primaryResult.section}
              score={primaryResult.score}
            />
          )}

          <RelatedSections
            results={relatedResults}
            onSelect={handleSelectRelated}
          />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background py-4">
          <Disclaimer />
        </div>
      </div>
    )
  }

  // No results view
  if (currentQuery && results.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center gap-6">
        <div className="text-4xl">🤔</div>
        <h2 className="text-xl font-semibold text-primary-dark">
          Hmm, I'm not sure...
        </h2>
        <p className="text-text-muted text-center max-w-xs">
          I couldn't find a clear rule about "{currentQuery}"
        </p>
        <button
          onClick={handleBack}
          className="text-primary-dark underline"
        >
          Try a different question
        </button>
        <QuickQuestions onSelect={handleSearch} disabled={!isReady} />
      </div>
    )
  }

  // Home/search view
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-8">
      <h1 className="text-2xl font-bold text-primary-dark text-center">
        What's the rule about...
      </h1>

      <VoiceButton
        isStarting={isStarting}
        isListening={isListening}
        isSupported={isSupported}
        onClick={toggleListening}
      />

      {isListening && transcript && (
        <p className="text-text-muted italic animate-pulse">
          "{transcript}"
        </p>
      )}

      <SearchInput onSearch={handleSearch} disabled={!isReady} />

      <QuickQuestions onSelect={handleSearch} disabled={!isReady} />

      <Disclaimer />
    </div>
  )
}

export default App
