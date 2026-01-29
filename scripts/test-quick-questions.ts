import { readFileSync } from "fs"
import { join } from "path"

const chunksPath = join(process.cwd(), "public", "data", "chunks.json")
const embeddingsPath = join(process.cwd(), "public", "data", "embeddings.json")

interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  subsectionPath: string
  content: string
  embeddingText: string
  category: string
}

const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))
const embeddingsData: { chunkId: string; embedding: number[] }[] = JSON.parse(
  readFileSync(embeddingsPath, "utf-8")
)
const embeddings = new Map(embeddingsData.map((e) => [e.chunkId, e.embedding]))

// Synonyms from search.ts
const SYNONYMS: Record<string, string[]> = {
  "puree": ["leftover", "prepared food", "refrigerated", "stored", "forty-eight hours"],
  "baby food": ["leftover", "prepared food", "infant", "refrigerated"],
  "juice": ["beverage", "drink", "fluid", "nutrition"],
  "milk": ["breast milk", "formula", "refrigerat", "bottle"],
  "nap": ["rest", "sleep", "infant"],
  "naptime": ["sleep", "rest", "crib", "equipment"],
  "diaper": ["diaper changing", "toileting"],
  "bathroom": ["toilet", "sink", "handwashing", "diaper"],
  "medicine": ["medication", "drug"],
  "ratio": ["staff", "supervision", "children per"],
  "ratios": ["staff", "supervision", "children per", "group size"],
  "teacher": ["staff", "provider", "ratio"],
  "outdoor play": ["outdoor", "physical activity"],
  "first aid": ["cpr", "emergency", "training"],
}

function expandQuery(query: string): string {
  let expanded = query.toLowerCase()
  for (const [term, synonyms] of Object.entries(SYNONYMS)) {
    if (expanded.includes(term)) {
      expanded += " " + synonyms.join(" ")
    }
  }
  return expanded
}

// BM25
class BM25 {
  private k1 = 1.5
  private b = 0.75
  private avgDocLength = 0
  private docLengths: number[] = []
  private termFreqs: Map<string, number[]> = new Map()
  private docFreqs: Map<string, number> = new Map()
  private numDocs = 0

  tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 2)
  }

  index(documents: string[]): void {
    this.numDocs = documents.length
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
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)))
        scores[i] += idf * tfNorm
      }
    }
    return scores
  }
}

const bm25 = new BM25()
bm25.index(chunks.map((c) => `${c.sectionTitle} ${c.content}`))

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function reciprocalRankFusion(
  rankings: { index: number; score: number }[][],
  weights: number[] = [1, 1],
  k = 60
): Map<number, number> {
  const fusedScores = new Map<number, number>()
  for (let r = 0; r < rankings.length; r++) {
    const ranking = rankings[r]
    const weight = weights[r] || 1
    const sorted = [...ranking].sort((a, b) => b.score - a.score)
    for (let rank = 0; rank < sorted.length; rank++) {
      const { index } = sorted[rank]
      const currentScore = fusedScores.get(index) || 0
      fusedScores.set(index, currentScore + weight / (k + rank + 1))
    }
  }
  return fusedScores
}

async function getQueryEmbedding(query: string): Promise<number[]> {
  const response = await fetch("http://localhost:11434/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "twine/mxbai-embed-xsmall-v1", input: query }),
  })
  const data = (await response.json()) as { embeddings: number[][] }
  return data.embeddings[0]
}

async function search(query: string, topK = 3) {
  const expandedQuery = expandQuery(query)
  const queryEmbedding = await getQueryEmbedding(expandedQuery)

  // Semantic scores
  const semanticScores: { index: number; score: number }[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunkEmbedding = embeddings.get(chunks[i].chunkId)
    if (!chunkEmbedding) continue
    const score = cosineSimilarity(queryEmbedding, chunkEmbedding)
    semanticScores.push({ index: i, score })
  }

  // BM25 scores
  const bm25Scores = bm25.search(expandedQuery)
  const bm25Results: { index: number; score: number }[] = []
  for (let i = 0; i < bm25Scores.length; i++) {
    if (bm25Scores[i] > 0) {
      bm25Results.push({ index: i, score: bm25Scores[i] })
    }
  }

  // RRF fusion
  const fusedScores = reciprocalRankFusion([semanticScores, bm25Results], [1.5, 1.0])

  const results = Array.from(fusedScores.entries())
    .map(([index, score]) => ({ chunk: chunks[index], score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return results
}

const quickQuestions = [
  { label: "Staff ratios", query: "What are the staff to child ratios?" },
  { label: "Bottle storage", query: "How long can a bottle sit out before refrigerating?" },
  { label: "Outdoor play", query: "How much outdoor play time is required?" },
  { label: "Nap rules", query: "What are the requirements for nap time and sleep?" },
  { label: "Diaper changing", query: "What are the diaper changing procedures?" },
  { label: "Hand washing", query: "When is hand washing required?" },
  { label: "First aid", query: "What first aid training is required?" },
  { label: "Medication", query: "What are the rules for giving medication to children?" },
]

async function main() {
  console.log("Testing Quick Questions from UI\n")
  console.log("=".repeat(100))

  for (const q of quickQuestions) {
    console.log(`\n[${q.label}]`)
    console.log(`Query: "${q.query}"`)
    console.log("-".repeat(100))

    const results = await search(q.query, 3)

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const num = i + 1
      console.log(`\n#${num}: ${r.chunk.sectionTitle} ${r.chunk.subsectionPath}`)
      console.log(`   Section: WAC ${r.chunk.id} | Score: ${r.score.toFixed(4)}`)
      console.log(`   Content: ${r.chunk.content.substring(0, 250)}...`)
    }
    console.log("\n" + "=".repeat(100))
  }
}

main().catch(console.error)
