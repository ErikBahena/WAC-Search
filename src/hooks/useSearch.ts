import { useState, useEffect, useCallback } from "react"
import { initSearch, search, isInitialized, SearchResult } from "@/lib/search"

interface UseSearchReturn {
  isLoading: boolean
  isReady: boolean
  progress: number
  results: SearchResult[]
  error: string | null
  doSearch: (query: string) => Promise<void>
}

export function useSearch(): UseSearchReturn {
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isInitialized()) {
      setIsReady(true)
      setIsLoading(false)
      return
    }

    initSearch(setProgress)
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
      setError(null)
      const searchResults = await search(query, 5)
      setResults(searchResults)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    }
  }, [isReady])

  return {
    isLoading,
    isReady,
    progress,
    results,
    error,
    doSearch,
  }
}
