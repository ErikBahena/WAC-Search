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
}

const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))
const embeddingsData: { chunkId: string; embedding: number[] }[] = JSON.parse(
  readFileSync(embeddingsPath, "utf-8")
)
const embeddings = new Map(embeddingsData.map((e) => [e.chunkId, e.embedding]))

// Synonyms
const SYNONYMS: Record<string, string[]> = {
  "puree": ["leftover", "prepared food", "refrigerated", "stored", "forty-eight hours"],
  "baby food": ["leftover", "prepared food", "infant", "refrigerated"],
  "homemade food": ["leftover", "prepared food", "refrigerated"],
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

async function getQueryEmbedding(query: string): Promise<number[]> {
  const response = await fetch("http://localhost:11434/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "twine/mxbai-embed-xsmall-v1", input: query }),
  })
  const data = (await response.json()) as { embeddings: number[][] }
  return data.embeddings[0]
}

async function debugQuery(query: string) {
  console.log(`\n${"=".repeat(80)}`)
  console.log(`Query: "${query}"`)

  const expanded = expandQuery(query)
  console.log(`Expanded: "${expanded}"`)
  console.log("=".repeat(80))

  const queryEmbedding = await getQueryEmbedding(expanded)
  const bm25Scores = bm25.search(query) // BM25 on original query

  // Find the leftover food chunk
  const targetChunkId = "110-300-0197-7a"
  const targetIndex = chunks.findIndex(c => c.chunkId === targetChunkId)

  if (targetIndex !== -1) {
    const chunk = chunks[targetIndex]
    const chunkEmbedding = embeddings.get(targetChunkId)!
    const semanticScore = cosineSimilarity(queryEmbedding, chunkEmbedding)
    const bm25Score = bm25Scores[targetIndex]

    console.log(`\nTARGET (${targetChunkId}):`)
    console.log(`  Semantic: ${semanticScore.toFixed(4)}`)
    console.log(`  BM25: ${bm25Score.toFixed(4)}`)
    console.log(`  Content: ${chunk.content.substring(0, 100)}...`)
  }

  // Get top 10 by semantic
  const semanticResults = chunks.map((c, i) => ({
    chunk: c,
    index: i,
    score: cosineSimilarity(queryEmbedding, embeddings.get(c.chunkId) || []),
  })).sort((a, b) => b.score - a.score).slice(0, 10)

  console.log(`\nTop 10 by SEMANTIC:`)
  semanticResults.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.chunk.chunkId} (${r.score.toFixed(4)}) - ${r.chunk.sectionTitle} ${r.chunk.subsectionPath}`)
  })

  // Get top 10 by BM25
  const bm25Results = chunks.map((c, i) => ({
    chunk: c,
    index: i,
    score: bm25Scores[i],
  })).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 10)

  console.log(`\nTop 10 by BM25:`)
  bm25Results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.chunk.chunkId} (${r.score.toFixed(4)}) - ${r.chunk.sectionTitle} ${r.chunk.subsectionPath}`)
  })
}

const query = process.argv[2] || "how long is a puree good for after it's been opened"
debugQuery(query).catch(console.error)
