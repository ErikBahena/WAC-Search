import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers"

// ============================================
// Q&A-Based Search - Simple and Accurate
// Using EmbeddingGemma for best-in-class quality
// ============================================

export interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

export interface QASearchResult {
  qa: QAPair
  score: number
  matchedQuestion: string
}

// Content chunk interface (used for hybrid search fallback)
export interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  subsectionPath: string
  content: string
  fullContent: string
  url: string
  category: string
  embeddingText: string
}

// EmbeddingGemma pipeline
let embedder: FeatureExtractionPipeline | null = null
let isInitializing = false
let initPromise: Promise<void> | null = null

// Module-level progress tracking (shared across React Strict Mode double-calls)
const fileProgress = new Map<string, { loaded: number; total: number }>()
let smoothedProgress = 0
let lastUpdateTime = 0

let qaPairs: QAPair[] = []
let qaEmbeddings: Map<string, number[]> = new Map()

// Content chunks and embeddings for hybrid search fallback
let chunks: WacChunk[] = []
let chunkEmbeddings: Map<string, number[]> = new Map()

// Must match the TRUNCATE_DIM used in embed scripts
const EMBEDDING_DIM = 256

// Vocabulary for typo correction
let vocabulary: Set<string> = new Set()
let wordIndex: Map<string, string[]> = new Map() // lowercase -> original words

// Check if WebGPU is available
async function getDevice(): Promise<"webgpu" | "wasm"> {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter()
      if (adapter) return "webgpu"
    } catch {
      // WebGPU not available
    }
  }
  return "wasm"
}

export async function initQASearch(
  onProgress?: (progress: number) => void
): Promise<void> {
  // Prevent double initialization (React Strict Mode calls effects twice)
  if (isInitializing && initPromise) {
    return initPromise
  }

  isInitializing = true

  // Reset progress tracking
  fileProgress.clear()
  lastReportedProgress = 0

  initPromise = doInitQASearch(onProgress)
  return initPromise
}

async function doInitQASearch(
  onProgress?: (progress: number) => void
): Promise<void> {
  // Load Q&A pairs
  const qaRes = await fetch("/data/qa-pairs.json")
  qaPairs = await qaRes.json()

  onProgress?.(0.05)

  // Load Q&A embeddings
  const embeddingsRes = await fetch("/data/qa-embeddings.json")
  const embeddingsData: { question: string; embedding: number[] }[] = await embeddingsRes.json()
  qaEmbeddings = new Map(embeddingsData.map((e) => [e.question, e.embedding]))

  onProgress?.(0.1)

  // Load content chunks for hybrid search fallback
  const chunksRes = await fetch("/data/chunks.json")
  chunks = await chunksRes.json()

  onProgress?.(0.15)

  // Load content embeddings
  const chunkEmbeddingsRes = await fetch("/data/embeddings.json")
  const chunkEmbeddingsData: { chunkId: string; embedding: number[] }[] = await chunkEmbeddingsRes.json()
  chunkEmbeddings = new Map(chunkEmbeddingsData.map((e) => [e.chunkId, e.embedding]))

  onProgress?.(0.2)

  // Detect device - use WASM for q8 models (WebGPU has slow dequantize ops)
  const device = await getDevice()
  const useDevice = device === "webgpu" ? "wasm" : "wasm" // Force WASM for q8
  console.log(`Using device: ${useDevice}`)

  // Load EmbeddingGemma pipeline
  const modelId = "onnx-community/embeddinggemma-300m-ONNX"

  // Model download is 75% of total progress (from 0.2 to 0.95)
  // Reset progress tracking state
  fileProgress.clear()
  smoothedProgress = 0.2
  lastUpdateTime = Date.now()
  onProgress?.(0.2)

  // Known file sizes for this model (prevents progress jumping when big file appears)
  const knownFileSizes: Record<string, number> = {
    "config.json": 1765,
    "generation_config.json": 133,
    "tokenizer_config.json": 1156830,
    "tokenizer.json": 20323312,
    "onnx/model_quantized.onnx": 567874,
    "onnx/model_quantized.onnx_data": 308890624,
  }

  embedder = await pipeline("feature-extraction", modelId, {
    dtype: "q8",
    device: useDevice,
    progress_callback: (p: unknown) => {
      const info = p as {
        status?: string
        file?: string
        loaded?: number
        total?: number
      }

      if (!info.file) return

      // When a file is initiated, register it with known size (or estimate)
      if (info.status === "initiate") {
        const estimatedTotal = knownFileSizes[info.file] || 1000000 // 1MB default
        fileProgress.set(info.file, { loaded: 0, total: estimatedTotal })
      }

      // Update progress when we get actual loaded/total
      if (info.status === "progress" &&
          typeof info.loaded === "number" && typeof info.total === "number" && info.total > 0) {
        fileProgress.set(info.file, { loaded: info.loaded, total: info.total })
      }

      // Calculate overall progress across all files
      let totalLoaded = 0
      let totalSize = 0
      for (const { loaded, total } of fileProgress.values()) {
        totalLoaded += loaded
        totalSize += total
      }

      if (totalSize > 0) {
        const overallProgress = totalLoaded / totalSize
        // Model download spans 0.2 to 0.95 (75% of total progress)
        const targetProgress = 0.2 + overallProgress * 0.75

        // Throttle updates to every 100ms minimum
        const now = Date.now()
        if (now - lastUpdateTime > 100) {
          lastUpdateTime = now
          // Smooth toward target (exponential moving average)
          smoothedProgress = smoothedProgress * 0.7 + targetProgress * 0.3
          onProgress?.(smoothedProgress)
        }
      }
    },
  }) as FeatureExtractionPipeline

  onProgress?.(0.95)

  // Build vocabulary for typo correction
  buildVocabulary()

  onProgress?.(1)
}

// Build vocabulary from Q&A questions for typo correction
function buildVocabulary(): void {
  vocabulary.clear()
  wordIndex.clear()

  // Extract words from Q&A questions
  for (const qa of qaPairs) {
    const words = qa.question.toLowerCase().match(/[a-z]+/g) || []
    for (const word of words) {
      if (word.length >= 3) {
        vocabulary.add(word)
        if (!wordIndex.has(word)) {
          wordIndex.set(word, [])
        }
      }
    }
  }

  // Also extract from chunk content for broader coverage
  for (const chunk of chunks) {
    const words = chunk.content.toLowerCase().match(/[a-z]+/g) || []
    for (const word of words) {
      if (word.length >= 4) { // Slightly longer for content words
        vocabulary.add(word)
      }
    }
  }

  console.log(`Built vocabulary with ${vocabulary.size} words`)
}

// Levenshtein distance for typo detection
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

// Common English words that should not be "corrected"
const COMMON_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "can", "to", "of", "in", "for", "on", "with", "at",
  "by", "from", "about", "into", "through", "during", "before", "after",
  "above", "below", "between", "under", "again", "further", "then", "once",
  "here", "there", "when", "where", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "just", "also",
  "my", "your", "his", "her", "its", "our", "their", "this", "that", "these",
  "what", "which", "who", "whom", "if", "or", "and", "but", "because",
  "as", "until", "while", "although", "though", "since",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "them", "us",
  "kid", "kids", "child", "baby", "dog", "cat", "pet", "pets", "rain", "sun",
  "deal", "teddy", "bear", "pool", "swim", "field", "trip", "homework", "help",
  "bring", "take", "put", "get", "give", "make", "go", "come", "see", "know",
  "think", "want", "need", "use", "find", "tell", "ask", "work", "play",
  "try", "leave", "call", "keep", "let", "begin", "seem", "show", "hear",
  "run", "move", "live", "believe", "hold", "happen", "allow", "meet", "pay",
  "send", "expect", "build", "stay", "fall", "cut", "reach", "kill", "remain",
])

// Find best match for a potentially misspelled word
function findBestMatch(word: string): string | null {
  const lower = word.toLowerCase()

  // If word exists in vocabulary, no correction needed
  if (vocabulary.has(lower)) {
    return null
  }

  // Don't correct common English words
  if (COMMON_WORDS.has(lower)) {
    return null
  }

  // Only correct longer words (short words are often valid)
  if (lower.length < 5) {
    return null
  }

  // Find closest match
  let bestMatch: string | null = null
  let bestDistance = Infinity
  // Be more conservative: max 2 edits, or 1 edit for shorter words
  const maxDistance = lower.length >= 8 ? 2 : 1

  for (const vocabWord of vocabulary) {
    // Quick length check to skip obviously different words
    if (Math.abs(vocabWord.length - lower.length) > maxDistance) continue

    // Skip if one is substring of the other (avoid kid->kids type corrections)
    if (lower.includes(vocabWord) || vocabWord.includes(lower)) continue

    const distance = levenshteinDistance(lower, vocabWord)
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance
      bestMatch = vocabWord
    }
  }

  return bestMatch
}

// Correct typos in a query
export function correctQuery(query: string): { corrected: string; hadCorrections: boolean } {
  const words = query.split(/\s+/)
  const correctedWords: string[] = []
  let hadCorrections = false

  for (const word of words) {
    // Skip short words and non-alphabetic
    if (word.length < 3 || !/^[a-zA-Z]+$/.test(word)) {
      correctedWords.push(word)
      continue
    }

    const correction = findBestMatch(word)
    if (correction) {
      correctedWords.push(correction)
      hadCorrections = true
      console.log(`Typo corrected: "${word}" -> "${correction}"`)
    } else {
      correctedWords.push(word.toLowerCase())
    }
  }

  return {
    corrected: correctedWords.join(" "),
    hadCorrections,
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Embed a query using the pipeline with correct prefix
async function embedQuery(text: string): Promise<number[]> {
  if (!embedder) {
    throw new Error("Model not initialized")
  }

  // Use the query prefix for search queries
  const prefixedText = `task: search result | query: ${text}`

  // Run the pipeline with pooling and normalization
  const result = await embedder(prefixedText, {
    pooling: "mean",
    normalize: true,
  })

  // Get the embedding data and truncate to match precomputed (Matryoshka)
  const fullEmbedding = Array.from(result.data as Float32Array)
  const embedding = fullEmbedding.slice(0, EMBEDDING_DIM)

  // Debug: check embedding values
  console.log("Query embedding (first 5):", embedding.slice(0, 5))
  console.log("Embedding length:", embedding.length)

  // Check a sample precomputed embedding
  const sampleQA = qaPairs[0]
  const sampleEmb = qaEmbeddings.get(sampleQA?.question)
  if (sampleEmb) {
    console.log("Sample QA embedding (first 5):", sampleEmb.slice(0, 5))
    console.log("Sample QA embedding length:", sampleEmb.length)
  }

  return embedding
}

export async function searchQA(query: string, topK = 5): Promise<QASearchResult[]> {
  if (!embedder) {
    throw new Error("Q&A Search not initialized")
  }

  // Embed the query
  const queryEmbedding = await embedQuery(query)

  // Find most similar questions
  const results: QASearchResult[] = []

  for (const qa of qaPairs) {
    const qaEmbedding = qaEmbeddings.get(qa.question)
    if (!qaEmbedding) continue

    const score = cosineSimilarity(queryEmbedding, qaEmbedding)
    results.push({
      qa,
      score,
      matchedQuestion: qa.question,
    })
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, topK)
}

// Search content chunks directly
export async function searchContent(query: string, topK = 10): Promise<{ chunk: WacChunk; score: number }[]> {
  if (!embedder) {
    throw new Error("Search not initialized")
  }

  const queryEmbedding = await embedQuery(query)

  const results: { chunk: WacChunk; score: number }[] = []

  for (const chunk of chunks) {
    const embedding = chunkEmbeddings.get(chunk.chunkId)
    if (!embedding) continue

    const score = cosineSimilarity(queryEmbedding, embedding)
    results.push({ chunk, score })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}

// Thresholds for topic coverage detection
const CONFIDENCE_HIGH_THRESHOLD = 0.75
const CONFIDENCE_MEDIUM_THRESHOLD = 0.65
const CONFIDENCE_LOW_THRESHOLD = 0.55
const TOPIC_COVERED_THRESHOLD = 0.60

// Hybrid search: Q&A first, fallback to content when scores are low
export async function hybridSearch(query: string, topK = 5): Promise<HybridSearchResponse> {
  if (!embedder) {
    throw new Error("Search not initialized")
  }

  // Apply typo correction
  const { corrected, hadCorrections } = correctQuery(query)
  const searchQuery = hadCorrections ? corrected : query

  const queryEmbedding = await embedQuery(searchQuery)

  // Search Q&A pairs
  const qaResults: QASearchResult[] = []
  for (const qa of qaPairs) {
    const qaEmbedding = qaEmbeddings.get(qa.question)
    if (!qaEmbedding) continue

    const score = cosineSimilarity(queryEmbedding, qaEmbedding)
    qaResults.push({ qa, score, matchedQuestion: qa.question })
  }
  qaResults.sort((a, b) => b.score - a.score)

  // Search content chunks
  const contentResults: { chunk: WacChunk; score: number }[] = []
  for (const chunk of chunks) {
    const embedding = chunkEmbeddings.get(chunk.chunkId)
    if (!embedding) continue

    const score = cosineSimilarity(queryEmbedding, embedding)
    contentResults.push({ chunk, score })
  }
  contentResults.sort((a, b) => b.score - a.score)

  // Combine results using Reciprocal Rank Fusion
  const seenSections = new Set<string>()
  const finalResults: SearchResult[] = []

  // Convert Q&A results to SearchResult format with boosted scores
  // Q&A results get a boost because they're curated answers
  const qaAsResults = qaResults.slice(0, 10).map((r, rank) => ({
    chunk: {
      id: r.qa.sectionId,
      chunkId: `qa-${r.qa.sectionId}-${rank}`,
      sectionTitle: r.qa.sectionTitle,
      subsectionPath: "",
      content: r.qa.answer,
      fullContent: `Q: ${r.qa.question}\n\nA: ${r.qa.answer}`,
      url: r.qa.url,
      category: "",
      embeddingText: r.qa.question,
    },
    score: r.score,
    isQA: true,
    originalRank: rank,
  }))

  const contentAsResults = contentResults.slice(0, 20).map((r, rank) => ({
    chunk: r.chunk,
    score: r.score,
    isQA: false,
    originalRank: rank,
  }))

  // Reciprocal Rank Fusion scoring
  const k = 60 // RRF constant
  const allResults = [...qaAsResults, ...contentAsResults]

  // Get best scores for adaptive weighting
  const bestQAScore = qaResults[0]?.score ?? 0
  const bestContentScore = contentResults[0]?.score ?? 0

  // Calculate RRF scores
  const rrfScores = new Map<string, { result: typeof allResults[0]; rrfScore: number }>()

  for (const result of allResults) {
    // Use section ID + isQA as key to allow both Q&A and content from same section
    const key = `${result.chunk.id}-${result.isQA ? 'qa' : 'content'}`
    const rank = result.originalRank

    // Adaptive weighting based on score quality
    // If content has higher score than Q&A, let it compete fairly
    let weight = 1.0
    if (result.isQA) {
      // Q&A gets boost only when Q&A score is clearly competitive
      if (bestContentScore > bestQAScore) {
        // Content has higher score - no Q&A boost, let scores decide
        weight = 1.0
      } else {
        // Q&A has higher or equal score - slight preference for curated
        weight = 1.2
      }
    }
    const rrfScore = weight / (k + rank + 1)

    const existing = rrfScores.get(key)
    if (!existing || rrfScore > existing.rrfScore) {
      rrfScores.set(key, { result, rrfScore })
    }
  }

  // Sort by RRF score, then by similarity score as tie-breaker
  const sortedResults = Array.from(rrfScores.values())
    .sort((a, b) => {
      const rrfDiff = b.rrfScore - a.rrfScore
      if (Math.abs(rrfDiff) > 0.0001) return rrfDiff
      // Tie-breaker: prefer higher similarity score
      return b.result.score - a.result.score
    })

  // Deduplicate by section ID, preferring Q&A results
  for (const { result } of sortedResults) {
    if (seenSections.has(result.chunk.id)) continue
    seenSections.add(result.chunk.id)

    finalResults.push({
      chunk: result.chunk,
      score: result.score,
      source: result.isQA ? "qa" : "content",
    })

    if (finalResults.length >= topK) break
  }

  // Calculate confidence based on top result score and score distribution
  const topScore = finalResults[0]?.score ?? 0
  const secondScore = finalResults[1]?.score ?? 0
  const thirdScore = finalResults[2]?.score ?? 0
  const scoreGap = topScore - secondScore

  // Check if top results are from the same or similar topics (sections)
  const topSections = finalResults.slice(0, 3).map(r => r.chunk.sectionTitle)
  const uniqueSections = new Set(topSections).size
  const topicsCluster = uniqueSections <= 2 // Results cluster around 1-2 topics

  // Debug logging
  console.log("=== SEARCH DEBUG ===")
  console.log("Query:", searchQuery)
  console.log("Results count:", finalResults.length)
  console.log("Top 3 scores:", finalResults.slice(0, 3).map(r => r.score.toFixed(4)))
  console.log("Top 3 sections:", topSections)
  console.log("Unique sections:", uniqueSections)
  console.log("Top score:", topScore.toFixed(4))

  // Determine confidence level based primarily on top score
  // Be conservative - only mark as "not covered" when scores are truly low
  let confidence: "high" | "medium" | "low" | "none"
  let topicCovered: boolean

  if (topScore >= CONFIDENCE_HIGH_THRESHOLD) {
    // High score means we found something relevant
    confidence = "high"
    topicCovered = true
    console.log("-> HIGH confidence (score >= 0.75)")
  } else if (topScore >= CONFIDENCE_MEDIUM_THRESHOLD) {
    confidence = "medium"
    topicCovered = true
    console.log("-> MEDIUM confidence (score >= 0.65)")
  } else if (topScore >= CONFIDENCE_LOW_THRESHOLD) {
    // Lower scores - check if results are scattered across unrelated topics
    const isScattered = uniqueSections >= 3 && (topScore - thirdScore) < 0.03
    console.log("-> LOW range, isScattered:", isScattered)
    if (isScattered) {
      confidence = "none"
      topicCovered = false
    } else {
      confidence = "low"
      topicCovered = true
    }
  } else {
    // Very low score - topic not covered
    confidence = "none"
    topicCovered = false
    console.log("-> NONE (score < 0.55)")
  }

  console.log("Final: confidence=", confidence, "topicCovered=", topicCovered)
  console.log("===================")


  // If topic isn't covered, return empty results
  if (!topicCovered) {
    return {
      results: [],
      correctedQuery: hadCorrections ? corrected : null,
      confidence: "none",
      topicCovered: false,
    }
  }

  return {
    results: finalResults,
    correctedQuery: hadCorrections ? corrected : null,
    confidence,
    topicCovered,
  }
}

export function isQAInitialized(): boolean {
  return embedder !== null
}

export interface SearchResult {
  chunk: WacChunk
  score: number
  source?: "qa" | "content"  // Where this result came from
}

export interface HybridSearchResponse {
  results: SearchResult[]
  correctedQuery: string | null  // If typos were corrected
  confidence: "high" | "medium" | "low" | "none"  // Topic coverage confidence
  topicCovered: boolean  // Whether we have content for this topic
}

// Convert QA results to chunk-style results for existing UI
export function qaToChunkResults(qaResults: QASearchResult[]): SearchResult[] {
  return qaResults.map((r) => ({
    chunk: {
      id: r.qa.sectionId,
      chunkId: `qa-${r.qa.sectionId}`,
      sectionTitle: r.qa.sectionTitle,
      subsectionPath: "",
      content: r.qa.answer,
      fullContent: `Q: ${r.qa.question}\n\nA: ${r.qa.answer}`,
      url: r.qa.url,
      category: "",
      embeddingText: r.qa.question,
    },
    score: r.score,
  }))
}
