import { useState, useEffect, useCallback } from "react"
import {
  getSearchTopicSuggestions,
  initSearchEngine,
  isSearchEngineReady,
  runSearch,
} from "@/lib/search-engine"
import type { SearchClarification, SearchDebugInfo, SearchResult, TopicSuggestion } from "@/lib/intent-types"

interface UseSearchReturn {
  isLoading: boolean
  isReady: boolean
  isSearching: boolean
  progress: number
  results: SearchResult[]
  error: string | null
  confidence: "high" | "medium" | "low" | "none"
  topicCovered: boolean
  correctedQuery: string | null
  clarification: SearchClarification | null
  debug: SearchDebugInfo | null
  topicSuggestions: TopicSuggestion[]
  doSearch: (query: string) => Promise<void>
}

export function useSearch(): UseSearchReturn {
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<"high" | "medium" | "low" | "none">("high")
  const [topicCovered, setTopicCovered] = useState(true)
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null)
  const [clarification, setClarification] = useState<SearchClarification | null>(null)
  const [debug, setDebug] = useState<SearchDebugInfo | null>(null)
  const [topicSuggestions, setTopicSuggestions] = useState<TopicSuggestion[]>([])

  useEffect(() => {
    if (isSearchEngineReady()) {
      setTopicSuggestions(getSearchTopicSuggestions())
      setIsReady(true)
      setIsLoading(false)
      return
    }

    initSearchEngine(setProgress)
      .then(() => {
        setTopicSuggestions(getSearchTopicSuggestions())
        setIsReady(true)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setIsLoading(false)
      })
  }, [])

  const doSearch = useCallback(async (query: string) => {
    if (!isReady) return

    try {
      setIsSearching(true)
      setError(null)
      setDebug(null)
      setClarification(null)
      const response = await runSearch(query, 5)
      setResults(response.results)
      setConfidence(response.confidence)
      setTopicCovered(response.topicCovered)
      setCorrectedQuery(response.correctedQuery)
      setClarification(response.clarification || null)
      setDebug(response.debug || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setIsSearching(false)
    }
  }, [isReady])

  return {
    isLoading,
    isReady,
    isSearching,
    progress,
    results,
    error,
    confidence,
    topicCovered,
    correctedQuery,
    clarification,
    debug,
    topicSuggestions,
    doSearch,
  }
}
