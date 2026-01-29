import { readFileSync } from "fs"
import { join } from "path"

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

interface WacChunk {
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

const OLLAMA_URL = "http://localhost:11434/api/embed"
const MODEL = "embeddinggemma"
const TRUNCATE_DIM = 256

// Vocabulary for typo correction
let vocabulary: Set<string> = new Set()

function buildVocabulary(qaPairs: QAPair[], chunks: WacChunk[]): void {
  vocabulary.clear()
  for (const qa of qaPairs) {
    const words = qa.question.toLowerCase().match(/[a-z]+/g) || []
    for (const word of words) {
      if (word.length >= 3) vocabulary.add(word)
    }
  }
  for (const chunk of chunks) {
    const words = chunk.content.toLowerCase().match(/[a-z]+/g) || []
    for (const word of words) {
      if (word.length >= 4) vocabulary.add(word)
    }
  }
  console.log(`Built vocabulary with ${vocabulary.size} words`)
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

const COMMON_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "can", "to", "of", "in", "for", "on", "with", "at",
  "by", "from", "about", "into", "through", "during", "before", "after",
  "my", "your", "his", "her", "its", "our", "their", "this", "that", "these",
  "what", "which", "who", "whom", "if", "or", "and", "but", "because",
  "kid", "kids", "child", "baby", "dog", "cat", "pet", "pets", "rain", "sun",
  "deal", "teddy", "bear", "pool", "swim", "field", "trip", "homework", "help",
  "bring", "take", "put", "get", "give", "make", "go", "come", "see", "know",
])

function findBestMatch(word: string): string | null {
  const lower = word.toLowerCase()
  if (vocabulary.has(lower)) return null
  if (COMMON_WORDS.has(lower)) return null
  if (lower.length < 5) return null

  let bestMatch: string | null = null
  let bestDistance = Infinity
  const maxDistance = lower.length >= 8 ? 2 : 1

  for (const vocabWord of vocabulary) {
    if (Math.abs(vocabWord.length - lower.length) > maxDistance) continue
    if (lower.includes(vocabWord) || vocabWord.includes(lower)) continue
    const distance = levenshteinDistance(lower, vocabWord)
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance
      bestMatch = vocabWord
    }
  }
  return bestMatch
}

function correctQuery(query: string): { corrected: string; hadCorrections: boolean } {
  const words = query.split(/\s+/)
  const correctedWords: string[] = []
  let hadCorrections = false
  for (const word of words) {
    if (word.length < 3 || !/^[a-zA-Z]+$/.test(word)) {
      correctedWords.push(word)
      continue
    }
    const correction = findBestMatch(word)
    if (correction) {
      correctedWords.push(correction)
      hadCorrections = true
    } else {
      correctedWords.push(word.toLowerCase())
    }
  }
  return { corrected: correctedWords.join(" "), hadCorrections }
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: text }),
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`)
  }

  const data = (await response.json()) as { embeddings: number[][] }
  return data.embeddings[0].slice(0, TRUNCATE_DIM)
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

async function testHybridSearch(
  query: string,
  qaPairs: QAPair[],
  qaEmbeddings: Map<string, number[]>,
  chunks: WacChunk[],
  chunkEmbeddings: Map<string, number[]>,
  topK = 3
) {
  console.log(`\n${"=".repeat(70)}`)
  console.log(`Query: "${query}"`)

  // Apply typo correction
  const { corrected, hadCorrections } = correctQuery(query)
  const searchQuery = hadCorrections ? corrected : query
  if (hadCorrections) {
    console.log(`  -> Corrected to: "${corrected}"`)
  }
  console.log("=".repeat(70))

  const queryEmbedding = await getEmbedding(searchQuery)

  // Search Q&A pairs
  const qaResults: { qa: QAPair; score: number; rank: number }[] = []
  for (const qa of qaPairs) {
    const qaEmbedding = qaEmbeddings.get(qa.question)
    if (!qaEmbedding) continue
    const score = cosineSimilarity(queryEmbedding, qaEmbedding)
    qaResults.push({ qa, score, rank: 0 })
  }
  qaResults.sort((a, b) => b.score - a.score)
  qaResults.forEach((r, i) => (r.rank = i))

  // Search content chunks
  const contentResults: { chunk: WacChunk; score: number; rank: number }[] = []
  for (const chunk of chunks) {
    const embedding = chunkEmbeddings.get(chunk.chunkId)
    if (!embedding) continue
    const score = cosineSimilarity(queryEmbedding, embedding)
    contentResults.push({ chunk, score, rank: 0 })
  }
  contentResults.sort((a, b) => b.score - a.score)
  contentResults.forEach((r, i) => (r.rank = i))

  // RRF fusion with adaptive weighting
  const k = 60
  const seenSections = new Set<string>()
  const fusedResults: {
    title: string
    content: string
    score: number
    rrfScore: number
    source: "Q&A" | "Content"
    sectionId: string
  }[] = []

  const bestQAScore = qaResults[0]?.score ?? 0
  const bestContentScore = contentResults[0]?.score ?? 0

  // Add Q&A results with adaptive weighting
  for (const r of qaResults.slice(0, 10)) {
    // If content has higher score, no Q&A boost
    const weight = bestContentScore > bestQAScore ? 1.0 : 1.2
    const rrfScore = weight / (k + r.rank + 1)
    fusedResults.push({
      title: r.qa.sectionTitle,
      content: r.qa.answer,
      score: r.score,
      rrfScore,
      source: "Q&A",
      sectionId: r.qa.sectionId,
    })
  }

  // Add content results (weighted 1.0x)
  for (const r of contentResults.slice(0, 20)) {
    const rrfScore = 1.0 / (k + r.rank + 1)
    fusedResults.push({
      title: r.chunk.sectionTitle,
      content: r.chunk.content,
      score: r.score,
      rrfScore,
      source: "Content",
      sectionId: r.chunk.id,
    })
  }

  // Sort by RRF score, then by similarity as tie-breaker, and deduplicate by section
  fusedResults.sort((a, b) => {
    const rrfDiff = b.rrfScore - a.rrfScore
    if (Math.abs(rrfDiff) > 0.0001) return rrfDiff
    return b.score - a.score  // Tie-breaker: higher similarity wins
  })

  let shown = 0
  for (const r of fusedResults) {
    if (seenSections.has(r.sectionId)) continue
    seenSections.add(r.sectionId)

    console.log(`\n#${shown + 1} [${r.source}] (sim: ${r.score.toFixed(4)}, rrf: ${r.rrfScore.toFixed(4)})`)
    console.log(`  Section: ${r.title}`)
    console.log(`  ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`)

    shown++
    if (shown >= topK) break
  }

  // Calculate confidence
  const topScore = fusedResults[0]?.score ?? 0
  const secondScore = fusedResults[1]?.score ?? 0
  const thirdScore = fusedResults[2]?.score ?? 0
  const scoreGap = topScore - secondScore
  const topSections = fusedResults.slice(0, 3).map(r => r.title)
  const uniqueSections = new Set(topSections).size
  const topicsCluster = uniqueSections <= 2
  let confidence: string
  let topicCovered: boolean

  if (topScore >= 0.75) {
    confidence = "HIGH"
    topicCovered = true
  } else if (topScore >= 0.65) {
    confidence = "MEDIUM"
    topicCovered = true
  } else if (topScore >= 0.55) {
    const isScattered = uniqueSections >= 3 && (topScore - thirdScore) < 0.03
    if (isScattered) {
      confidence = "NONE"
      topicCovered = false
    } else {
      confidence = "LOW"
      topicCovered = true
    }
  } else {
    confidence = "NONE"
    topicCovered = false
  }

  // Show confidence and coverage
  const topQA = qaResults[0]
  const topContent = contentResults[0]
  console.log(`\n  [Best Q&A: ${topQA?.score.toFixed(4)} | Best Content: ${topContent?.score.toFixed(4)}]`)
  console.log(`  [Confidence: ${confidence} | Topic Covered: ${topicCovered ? "YES" : "NO"}]`)

  if (!topicCovered) {
    console.log(`  ⚠️  WOULD SHOW "TOPIC NOT COVERED" MESSAGE`)
  }
}

async function main() {
  // Load Q&A pairs
  const qaPath = join(process.cwd(), "public", "data", "qa-pairs.json")
  const qaPairs: QAPair[] = JSON.parse(readFileSync(qaPath, "utf-8"))

  // Load Q&A embeddings
  const qaEmbeddingsPath = join(process.cwd(), "public", "data", "qa-embeddings.json")
  const qaEmbeddingsData: { question: string; embedding: number[] }[] = JSON.parse(
    readFileSync(qaEmbeddingsPath, "utf-8")
  )
  const qaEmbeddings = new Map(qaEmbeddingsData.map((e) => [e.question, e.embedding]))

  // Load content chunks
  const chunksPath = join(process.cwd(), "public", "data", "chunks.json")
  const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))

  // Load content embeddings
  const chunkEmbeddingsPath = join(process.cwd(), "public", "data", "embeddings.json")
  const chunkEmbeddingsData: { chunkId: string; embedding: number[] }[] = JSON.parse(
    readFileSync(chunkEmbeddingsPath, "utf-8")
  )
  const chunkEmbeddings = new Map(chunkEmbeddingsData.map((e) => [e.chunkId, e.embedding]))

  console.log(`Loaded ${qaPairs.length} Q&A pairs, ${qaEmbeddings.size} Q&A embeddings`)
  console.log(`Loaded ${chunks.length} chunks, ${chunkEmbeddings.size} chunk embeddings`)

  // Build vocabulary for typo correction
  buildVocabulary(qaPairs, chunks)

  console.log(`\nTesting HYBRID search with TYPO CORRECTION and CONFIDENCE DETECTION...`)

  // Edge case and unusual queries to test robustness
  const testQueries = [
    // Slang/casual phrasing
    "can my kid nap with a teddy bear",
    "is hitting kids allowed",
    "whats the deal with sunscreen",

    // Vague/broad questions - should be "topic not covered"
    "what about pets",
    "swimming pool rules",
    "field trip requirements",

    // Misspellings and typos - should be corrected
    "diapper changing rules",
    "tempurature for milk",
    "fomula storage",
    "handwahsing requirements",

    // Completely unrelated topics - should be "topic not covered"
    "can I bring my dog to daycare",
    "what about homework help",

    // Topics that ARE covered
    "TV and screen time limits",
    "what if there's a tornado",
    "can kids play in the rain",
    "overnight care rules",
    "can a 16 year old work at daycare",
  ]

  for (const query of testQueries) {
    await testHybridSearch(query, qaPairs, qaEmbeddings, chunks, chunkEmbeddings)
  }
}

main().catch(console.error)
