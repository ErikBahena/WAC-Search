import {
  pipeline,
  FeatureExtractionPipeline,
  AutoTokenizer,
  AutoModelForSequenceClassification,
  PreTrainedTokenizer,
  PreTrainedModel,
} from "@huggingface/transformers"

// ============================================
// BM25 Implementation for Hybrid Search
// ============================================

class BM25 {
  private k1 = 1.5
  private b = 0.75
  private avgDocLength = 0
  private docLengths: number[] = []
  private termFreqs: Map<string, number[]> = new Map() // term -> [freq per doc]
  private docFreqs: Map<string, number> = new Map() // term -> num docs containing term
  private numDocs = 0

  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2)
  }

  index(documents: string[]): void {
    this.numDocs = documents.length

    // Calculate doc lengths and term frequencies
    for (let i = 0; i < documents.length; i++) {
      const tokens = this.tokenize(documents[i])
      this.docLengths[i] = tokens.length

      const termCounts = new Map<string, number>()
      for (const token of tokens) {
        termCounts.set(token, (termCounts.get(token) || 0) + 1)
      }

      for (const [term, count] of termCounts) {
        if (!this.termFreqs.has(term)) {
          this.termFreqs.set(term, new Array(this.numDocs).fill(0))
        }
        this.termFreqs.get(term)![i] = count
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1)
      }
    }

    this.avgDocLength = this.docLengths.reduce((a, b) => a + b, 0) / this.numDocs
  }

  search(query: string): number[] {
    const queryTokens = this.tokenize(query)
    const scores = new Array(this.numDocs).fill(0)

    for (const term of queryTokens) {
      const docFreq = this.docFreqs.get(term) || 0
      if (docFreq === 0) continue

      const idf = Math.log((this.numDocs - docFreq + 0.5) / (docFreq + 0.5) + 1)
      const termFreqArray = this.termFreqs.get(term)!

      for (let i = 0; i < this.numDocs; i++) {
        const tf = termFreqArray[i]
        if (tf === 0) continue

        const docLength = this.docLengths[i]
        const tfNorm = (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)))
        scores[i] += idf * tfNorm
      }
    }

    return scores
  }
}

// ============================================
// Reciprocal Rank Fusion for combining results
// ============================================

function reciprocalRankFusion(
  rankings: { index: number; score: number }[][],
  weights: number[] = [1, 1],
  k = 60
): Map<number, number> {
  const fusedScores = new Map<number, number>()

  for (let r = 0; r < rankings.length; r++) {
    const ranking = rankings[r]
    const weight = weights[r] || 1
    // Sort by score descending and get ranks
    const sorted = [...ranking].sort((a, b) => b.score - a.score)
    for (let rank = 0; rank < sorted.length; rank++) {
      const { index } = sorted[rank]
      const currentScore = fusedScores.get(index) || 0
      fusedScores.set(index, currentScore + weight / (k + rank + 1))
    }
  }

  return fusedScores
}

// ============================================
// Main Search Types and State
// ============================================

export interface WacChunk {
  id: string // Section ID, e.g., "110-300-0280"
  chunkId: string // Unique chunk ID, e.g., "110-300-0280-3-l"
  sectionTitle: string // e.g., "Bottle preparation"
  subsectionPath: string // e.g., "(3)(l)"
  content: string // The specific chunk content
  fullContent: string // Full section content for "view more"
  url: string
  category: string
  embeddingText: string
}

export interface SearchResult {
  chunk: WacChunk
  score: number
}

let extractor: FeatureExtractionPipeline | null = null
let rerankerTokenizer: PreTrainedTokenizer | null = null
let rerankerModel: PreTrainedModel | null = null
let chunks: WacChunk[] = []
let embeddings: Map<string, number[]> = new Map()
let bm25: BM25 | null = null

// Check if WebGPU is available (simple check, phones usually don't have it)
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

export async function initSearch(
  onProgress?: (progress: number) => void
): Promise<void> {
  // Load chunks
  const chunksRes = await fetch("/data/chunks.json")
  chunks = await chunksRes.json()

  // Load embeddings
  const embeddingsRes = await fetch("/data/embeddings.json")
  const embeddingsData: { chunkId: string; embedding: number[] }[] = await embeddingsRes.json()

  embeddings = new Map(embeddingsData.map((e) => [e.chunkId, e.embedding]))

  // Build BM25 index for hybrid search
  bm25 = new BM25()
  bm25.index(chunks.map(c => `${c.sectionTitle} ${c.content}`))

  onProgress?.(0.1)

  // Detect device (WebGPU on desktop, WASM on phones)
  const device = await getDevice()
  console.log(`Using device: ${device}`)

  // Load embedding model
  extractor = await (pipeline as Function)(
    "feature-extraction",
    "mixedbread-ai/mxbai-embed-xsmall-v1",
    {
      dtype: "q8",
      device,
      progress_callback: (p: { progress?: number }) => {
        if (p.progress) {
          onProgress?.(0.1 + p.progress * 0.004)
        }
      },
    }
  ) as FeatureExtractionPipeline

  onProgress?.(0.5)

  // Load cross-encoder for reranking (small 23M param model)
  try {
    rerankerTokenizer = await AutoTokenizer.from_pretrained("Xenova/ms-marco-MiniLM-L-6-v2")
    onProgress?.(0.7)

    rerankerModel = await AutoModelForSequenceClassification.from_pretrained(
      "Xenova/ms-marco-MiniLM-L-6-v2",
      {
        dtype: "q8",
        device,
      }
    )
    console.log("Cross-encoder reranker loaded")
  } catch (err) {
    console.warn("Failed to load reranker, will use hybrid scores only:", err)
  }

  onProgress?.(1)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Synonym mappings: common terms → WAC terminology
const SYNONYMS: Record<string, string[]> = {
  // Food related
  "puree": ["leftover", "prepared food", "refrigerated", "stored", "forty-eight hours"],
  "baby food": ["leftover", "prepared food", "infant", "refrigerated"],
  "homemade food": ["leftover", "prepared food", "refrigerated"],
  "juice": ["beverage", "drink", "fluid", "nutrition"],
  "choking": ["food", "hazard", "safe", "size", "cut"],
  "milk": ["breast milk", "formula", "refrigerat", "bottle"],
  "throw out": ["discard", "dispose", "hour", "expire"],

  // Sleep related
  "nap": ["rest", "sleep", "infant"],
  "naptime": ["sleep", "rest", "crib", "equipment"],
  "nap room": ["sleep", "rest", "crib", "equipment"],
  "blanket": ["bedding", "crib", "sleep", "soft", "infant"],
  "crib": ["sleep", "infant", "safe sleep", "equipment"],

  // Outdoor/play
  "playground": ["outdoor", "play space", "play area"],
  "outside": ["outdoor", "play space"],
  "outside time": ["outdoor", "play", "physical activity"],

  // Bathroom/diaper
  "diaper": ["diaper changing", "toileting"],
  "bathroom": ["toilet", "sink", "handwashing", "diaper"],
  "potty": ["toilet", "training", "bathroom"],

  // Health/illness
  "sick": ["ill", "illness", "symptom", "contagious"],
  "pink eye": ["illness", "contagious", "exclude", "conjunctivitis"],
  "lice": ["illness", "head", "exclude", "contagious"],
  "fever": ["illness", "temperature", "exclude", "sick"],
  "bruise": ["injury", "incident", "report", "harm"],
  "boo boo": ["injury", "first aid", "incident"],
  "owies": ["injury", "first aid", "incident"],

  // Medication
  "medicine": ["medication", "drug"],
  "tylenol": ["medication", "medicine"],
  "melatonin": ["medication", "medicine", "sleep"],
  "epipen": ["medication", "emergency", "allergy"],

  // Immunization
  "shot": ["immunization", "vaccine"],
  "shots": ["immunization", "vaccine"],

  // Staff/ratios
  "ratio": ["staff", "supervision", "children per"],
  "ratios": ["staff", "supervision", "children per", "group size"],
  "teacher": ["staff", "provider", "ratio"],
  "watch": ["supervise", "ratio", "care for"],
  "volunteer": ["staff", "supervision", "background"],
  "work at": ["staff", "qualif", "age", "employ"],
  "fingerprint": ["background check", "criminal history"],
  "fingerprinting": ["background check", "criminal history"],

  // Emergency
  "fire": ["emergency", "evacuation", "drill", "preparedness"],
  "what do i do": ["procedure", "plan", "emergency", "preparedness"],
  "during a fire": ["evacuation", "drill", "emergency preparedness"],
  "earthquake": ["drill", "emergency", "disaster", "preparedness"],
  "lost child": ["emergency", "missing", "procedure"],

  // Facilities/space
  "fence": ["barrier", "height", "forty-eight inches", "outdoor", "enclosed"],
  "tall": ["height", "inches", "feet"],

  // Activities
  "swimming": ["water activities", "pool"],
  "pool": ["water activities", "swimming"],

  // Temperature
  "warm": ["temperature", "degrees", "fahrenheit"],
  "hot": ["temperature", "degrees"],
  "cold": ["temperature", "degrees", "refrigerat"],

  // TV/media
  "tv": ["television", "screen", "video", "media"],
  "screen time": ["television", "video", "electronic media"],

  // Behavior/discipline
  "time out": ["discipline", "guidance", "behavior"],
  "timeout": ["discipline", "guidance", "behavior"],
  "yell": ["discipline", "prohibit", "guidance", "behavior"],
  "hitting": ["discipline", "prohibit", "physical", "corporal"],
  "hit": ["discipline", "prohibit", "physical", "corporal"],
  "bite": ["incident", "injury", "behavior"],
  "aggressive": ["behavior", "guidance", "intervention"],

  // Children terms
  "kids": ["children", "child"],
  "baby": ["infant", "child"],
  "babies": ["infant", "children"],
  "toddler": ["child", "infant", "young"],
  "newborn": ["infant", "child"],

  // Parent/pickup
  "stranger": ["release", "authorized", "parent", "guardian"],
  "pickup": ["release", "authorized", "parent"],
  "pick up": ["release", "authorized", "parent"],

  // Licensing/complaints
  "complain": ["report", "enforcement", "violation", "department"],
  "complaint": ["report", "enforcement", "violation"],
  "touring": ["license", "visit", "inspect"],

  // Overnight/special care
  "overnight": ["sleep", "night", "care"],

  // Schedule
  "schedule": ["routine", "daily", "activity", "program"],

  // Safety general
  "safety": ["safe", "hazard", "protect"],
  "safty": ["safe", "hazard", "protect"],
}

// Category keywords for boosting
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Food & Nutrition": ["food", "eat", "meal", "snack", "bottle", "formula", "milk", "puree", "feed", "lunch", "breakfast", "dinner", "refrigerat", "cook"],
  "Health & Safety": ["safe", "sick", "ill", "injur", "emergency", "first aid", "medic", "health", "sanit", "clean", "wash"],
  "Staffing": ["staff", "ratio", "teacher", "provider", "train", "qualif", "background", "supervis"],
  "Licensing": ["license", "certif", "require", "comply", "regulation", "inspect"],
}

// Time-related keywords that suggest the user wants duration/time limits
const TIME_KEYWORDS = ["how long", "how many hours", "how many minutes", "time", "duration", "expire", "safe for", "keep", "store", "last"]
const TIME_CONTENT_KEYWORDS = ["hour", "minute", "day", "week", "month", "within", "before", "after", "expire"]

// Number-related patterns
const NUMBER_KEYWORDS = ["how many", "how much", "minimum", "maximum", "at least", "no more than", "limit"]

function expandQuery(query: string): string {
  let expanded = query.toLowerCase()
  for (const [term, synonyms] of Object.entries(SYNONYMS)) {
    if (expanded.includes(term)) {
      expanded += " " + synonyms.join(" ")
    }
  }
  return expanded
}

function getRelevantCategories(query: string): string[] {
  const lowerQuery = query.toLowerCase()
  const relevant: string[] = []
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      relevant.push(category)
    }
  }
  return relevant
}

function hasTimeIntent(query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return TIME_KEYWORDS.some(kw => lowerQuery.includes(kw))
}

function hasNumberIntent(query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return NUMBER_KEYWORDS.some(kw => lowerQuery.includes(kw))
}

function hasTimeContent(content: string): boolean {
  const lowerContent = content.toLowerCase()
  return TIME_CONTENT_KEYWORDS.some(kw => lowerContent.includes(kw))
}

function hasNumberContent(content: string): boolean {
  // Check for numbers in the content
  return /\b\d+\b/.test(content)
}

export async function search(query: string, topK = 5): Promise<SearchResult[]> {
  if (!extractor || !bm25) {
    throw new Error("Search not initialized")
  }

  // Expand query with synonyms for embedding
  const expandedQuery = expandQuery(query)

  // ========== SEMANTIC SEARCH ==========
  const output = await extractor(expandedQuery, { pooling: "mean", normalize: true })
  const queryEmbedding = Array.from(output.data as Float32Array)

  const semanticScores: { index: number; score: number }[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const chunkEmbedding = embeddings.get(chunk.chunkId)
    if (!chunkEmbedding) continue

    const score = cosineSimilarity(queryEmbedding, chunkEmbedding)
    semanticScores.push({ index: i, score })
  }

  // ========== BM25 KEYWORD SEARCH ==========
  // Use expanded query for BM25 too so synonyms help keyword matching
  const bm25Scores = bm25.search(expandedQuery)
  const bm25Results: { index: number; score: number }[] = []
  for (let i = 0; i < bm25Scores.length; i++) {
    if (bm25Scores[i] > 0) {
      bm25Results.push({ index: i, score: bm25Scores[i] })
    }
  }

  // ========== RECIPROCAL RANK FUSION ==========
  // Weight semantic higher (1.5) than BM25 (1.0) for better question answering
  const fusedScores = reciprocalRankFusion([semanticScores, bm25Results], [1.5, 1.0])

  // ========== APPLY INTENT-BASED BOOSTS ==========
  const queryHasTimeIntent = hasTimeIntent(query)
  const queryHasNumberIntent = hasNumberIntent(query)
  const relevantCategories = getRelevantCategories(query)

  const results: SearchResult[] = []
  for (const [index, fusedScore] of fusedScores) {
    const chunk = chunks[index]
    let score = fusedScore

    // Boost chunks with time-related content if query has time intent
    if (queryHasTimeIntent && hasTimeContent(chunk.content)) {
      score *= 1.2
    }

    // Boost chunks with numbers if query asks for quantities
    if (queryHasNumberIntent && hasNumberContent(chunk.content)) {
      score *= 1.1
    }

    // Boost chunks from relevant categories
    if (relevantCategories.includes(chunk.category)) {
      score *= 1.1
    }

    results.push({ chunk, score })
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  // ========== CROSS-ENCODER RERANKING ==========
  // Take top candidates and rerank with cross-encoder for better precision
  if (rerankerTokenizer && rerankerModel && results.length > 0) {
    const candidateCount = Math.min(15, results.length) // Rerank top 15 candidates
    const candidates = results.slice(0, candidateCount)

    try {
      // Prepare batched input for cross-encoder
      const queries = candidates.map(() => query)
      const documents = candidates.map(r => `${r.chunk.sectionTitle} ${r.chunk.content}`.slice(0, 512))

      // Tokenize query-document pairs
      const inputs = rerankerTokenizer(queries, {
        text_pair: documents,
        padding: true,
        truncation: true,
        max_length: 512,
      })

      // Get relevance scores
      const output = await rerankerModel(inputs)
      const logits = output.logits.data as Float32Array

      // Create reranked results with cross-encoder scores
      const rerankedResults: SearchResult[] = candidates.map((result, i) => ({
        chunk: result.chunk,
        score: logits[i], // Higher score = more relevant
      }))

      // Sort by reranker score descending
      rerankedResults.sort((a, b) => b.score - a.score)
      return rerankedResults.slice(0, topK)
    } catch (err) {
      console.warn("Reranking failed, using hybrid scores:", err)
    }
  }

  return results.slice(0, topK)
}

export function isInitialized(): boolean {
  return extractor !== null
}
