import { useState, useEffect } from "react"
import { useSearch } from "@/hooks/useSearch"
import { useVoice } from "@/hooks/useVoice"
import { useReturningUser } from "@/hooks/useReturningUser"
import type { SearchResult } from "@/lib/search-qa"
import { VoiceButton } from "@/components/VoiceButton"
import { SearchInput } from "@/components/SearchInput"
import { AnswerCard } from "@/components/AnswerCard"
import { QuickQuestions } from "@/components/QuickQuestions"
import { RelatedSections } from "@/components/RelatedSections"
import { Disclaimer } from "@/components/Disclaimer"
import { LoadingScreen } from "@/components/LoadingScreen"
import { TopicNotFound } from "@/components/TopicNotFound"
import { Hero } from "@/components/Hero"
import { FeatureCards } from "@/components/FeatureCards"
import { ArrowLeft } from "lucide-react"

function App() {
  const { isLoading, isReady, progress, results, confidence, topicCovered, correctedQuery, doSearch } = useSearch()
  const {
    isSupported,
    isStarting,
    isListening,
    transcript,
    startListening,
    stopListening,
  } = useVoice()
  const { showFullLanding, revealFullLanding } = useReturningUser()

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
    ? results.filter((r) => r.chunk.chunkId !== selectedResult.chunk.chunkId)
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

          {correctedQuery && (
            <p className="text-sm text-amber-600">
              Searching for: "{correctedQuery}"
            </p>
          )}

          {confidence === "low" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              This topic may not be fully covered in the regulations. Results shown are the closest matches.
            </div>
          )}

          {primaryResult && (
            <AnswerCard
              chunk={primaryResult.chunk}
              score={primaryResult.score}
              source={primaryResult.source}
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

  // No results view - topic not covered
  if (currentQuery && (results.length === 0 || !topicCovered)) {
    return (
      <TopicNotFound
        query={currentQuery}
        correctedQuery={correctedQuery}
        onBack={handleBack}
        onTryExample={handleSearch}
      />
    )
  }

  // Home/search view
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-6">
      <Hero showFullContent={showFullLanding} onLearnMore={revealFullLanding} />

      <div className="flex flex-col items-center gap-6 w-full">
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
      </div>

      {showFullLanding && <FeatureCards />}

      <Disclaimer />
    </div>
  )
}

export default App
