import type { SearchResponse, TopicSuggestion } from "./intent-types"

let intentModulePromise: Promise<typeof import("./intent-search")> | null = null
let intentSuggestions: TopicSuggestion[] = []
let intentReady = false

async function loadIntentModule(): Promise<typeof import("./intent-search")> {
  if (!intentModulePromise) {
    intentModulePromise = import("./intent-search")
  }
  return intentModulePromise
}

function trackSearchEvent(event: string, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return

  const va = (window as unknown as { va?: (name: string, data?: Record<string, unknown>) => void }).va
  if (typeof va === "function") {
    va(event, payload)
  }
}

export async function initSearchEngine(onProgress?: (progress: number) => void): Promise<void> {
  const intent = await loadIntentModule()
  onProgress?.(0.05)
  await intent.initIntentSearch((p) => onProgress?.(Math.min(0.9, p * 0.9)))
  intentReady = true
  intentSuggestions = intent.getIntentTopicSuggestions()
  trackSearchEvent("search_engine_mode", { engine: "intent_v1" })
  onProgress?.(1)
}

export function isSearchEngineReady(): boolean {
  return intentReady
}

export function getActiveSearchEngine() {
  return "intent_v1" as const
}

export function getSearchTopicSuggestions(): TopicSuggestion[] {
  return intentSuggestions
}

export async function runSearch(query: string, topK = 5): Promise<SearchResponse> {
  try {
    const intent = await loadIntentModule()
    const response = await intent.searchWithIntent(query, topK)

    trackSearchEvent(response.outcome === "matched" ? "search_matched" : "search_abstain", {
      engine: "intent_v1",
      confidence: response.confidence,
      results: response.results.length,
    })

    return response
  } catch (error) {
    trackSearchEvent("search_error", {
      engine: "intent_v1",
      message: error instanceof Error ? error.message : "unknown_error",
    })
    throw error
  }
}
