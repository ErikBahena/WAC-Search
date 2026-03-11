export type SearchOutcome = "matched" | "abstain"

export type SearchEngineName = "intent_v1"

export interface IntentResult {
  outcome: SearchOutcome
  qaId?: string
  confidence: number
  margin: number
  reason?: "ood" | "low_confidence" | "low_margin"
}

export interface AnswerBankRecord {
  qaId: string
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

export interface TopicSuggestion {
  label: string
  query: string
}

export interface QueryBankRecord {
  qaId: string
  sectionId: string
  queries: string[]
}

export interface QAPair {
  qaId?: string
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

export interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  subsectionPath: string
  content: string
  fullContent: string
  url: string
  category: string
}

export interface SearchResult {
  chunk: WacChunk
  question?: string
  score: number
  source?: "qa" | "content"
}

export interface SearchDebugSectionScore {
  label: string
  confidence: number
}

export interface SearchDebugCandidate {
  qaId: string
  sectionId: string
  question: string
  score: number
  url: string
}

export interface SearchDebugInfo {
  engine: SearchEngineName
  normalizedQuery: string
  topLabel?: string
  confidence?: number
  margin?: number
  reason?: "ood" | "low_confidence" | "low_margin" | "no_candidates"
  topSections?: SearchDebugSectionScore[]
  topCandidates?: SearchDebugCandidate[]
}

export interface SearchResponse {
  results: SearchResult[]
  correctedQuery: string | null
  confidence: "high" | "medium" | "low" | "none"
  topicCovered: boolean
  outcome: SearchOutcome
  debug?: SearchDebugInfo
}
