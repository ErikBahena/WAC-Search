import { useState, useEffect, useCallback } from "react"
import { initQASearch, hybridSearch, isQAInitialized } from "@/lib/search-qa"
import type { SearchResult } from "@/lib/search-qa"

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

  useEffect(() => {
    if (isQAInitialized()) {
      setIsReady(true)
      setIsLoading(false)
      return
    }

    initQASearch(setProgress)
      .then(() => {
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
      // Use hybrid search: Q&A + content fallback
      const response = await hybridSearch(query, 5)
      setResults(response.results)
      setConfidence(response.confidence)
      setTopicCovered(response.topicCovered)
      setCorrectedQuery(response.correctedQuery)
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
    doSearch,
  }
}
