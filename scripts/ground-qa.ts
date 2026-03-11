import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  subsectionPath: string
  content: string
  fullContent: string
  url: string
}

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

class BM25Index {
  private k1 = 1.5
  private b = 0.75
  private avgDocLength = 0
  private docLengths: number[] = []
  private termFreqs = new Map<string, number[]>()
  private docFreqs = new Map<string, number>()
  private numDocs = 0

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
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

    this.avgDocLength =
      this.docLengths.reduce((sum, length) => sum + length, 0) / this.numDocs
  }

  search(query: string): number[] {
    const queryTokens = this.tokenize(query)
    const scores = new Array(this.numDocs).fill(0)

    for (const term of queryTokens) {
      const docFreq = this.docFreqs.get(term) || 0
      if (docFreq === 0) continue

      const idf =
        Math.log((this.numDocs - docFreq + 0.5) / (docFreq + 0.5) + 1)
      const termFreqArray = this.termFreqs.get(term)!

      for (let i = 0; i < this.numDocs; i++) {
        const tf = termFreqArray[i]
        if (tf === 0) continue

        const docLength = this.docLengths[i]
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)))
        scores[i] += idf * tfNorm
      }
    }

    return scores
  }
}

function cleanAnswer(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\u2019/g, "'")
    .trim()
}

function main(): void {
  const qaPath = join(process.cwd(), "public", "data", "qa-pairs.json")
  const chunksPath = join(process.cwd(), "public", "data", "chunks.json")

  const qaPairs: QAPair[] = JSON.parse(readFileSync(qaPath, "utf-8"))
  const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))

  const chunksBySection = new Map<string, WacChunk[]>()
  for (const chunk of chunks) {
    if (!chunksBySection.has(chunk.id)) {
      chunksBySection.set(chunk.id, [])
    }
    chunksBySection.get(chunk.id)!.push(chunk)
  }

  let fallbackCount = 0

  const groundedPairs: QAPair[] = qaPairs.map((qa) => {
    const sectionChunks = chunksBySection.get(qa.sectionId) || []
    if (sectionChunks.length === 0) {
      fallbackCount++
      return qa
    }

    const sectionDocs = sectionChunks.map(
      (c) => `${c.sectionTitle} ${c.subsectionPath} ${c.content}`
    )
    const sectionIndex = new BM25Index()
    sectionIndex.index(sectionDocs)
    const selectionQuery = `${qa.question} ${qa.answer}`
    const sectionScores = sectionIndex.search(selectionQuery)

    let bestChunk = sectionChunks[0]
    let bestScore = -Infinity
    for (let i = 0; i < sectionScores.length; i++) {
      const overviewPenalty = sectionChunks[i].subsectionPath === "overview" ? 0.2 : 0
      const score = sectionScores[i] - overviewPenalty
      if (score > bestScore) {
        bestScore = score
        bestChunk = sectionChunks[i]
      }
    }

    if (bestScore <= 0) {
      fallbackCount++
      const specific = sectionChunks.find((c) => c.subsectionPath !== "overview")
      bestChunk = specific || sectionChunks[0]
    }

    return {
      question: qa.question,
      answer: cleanAnswer(bestChunk.content),
      sectionId: qa.sectionId,
      sectionTitle: qa.sectionTitle,
      url: qa.url,
    }
  })

  writeFileSync(qaPath, JSON.stringify(groundedPairs, null, 2))

  console.log(`Grounded ${groundedPairs.length} Q&A pairs`)
  console.log("Section changes: 0 (preserved original section IDs)")
  console.log(`Fallbacks used: ${fallbackCount}`)
}

main()
