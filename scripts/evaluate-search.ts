import { readFileSync } from "fs"
import { join } from "path"

/**
 * Search Quality Evaluation
 *
 * Metrics:
 * - Hit Rate@K: Did any correct answer appear in top K results?
 * - MRR (Mean Reciprocal Rank): Average of 1/rank of first correct answer
 * - Precision@K: What fraction of top K results are relevant?
 */

interface TestCase {
  query: string
  // Keywords that MUST appear in correct answer (case-insensitive)
  mustContain: string[]
  // Section IDs that are considered correct answers
  correctSections?: string[]
  // Category of test (for breakdown)
  category: "food" | "safety" | "staffing" | "health" | "facilities" | "general"
}

// Ground truth test cases based on WAC content
const TEST_CASES: TestCase[] = [
  // FOOD & NUTRITION
  {
    query: "How long can formula sit out?",
    mustContain: ["hour", "formula"],
    correctSections: ["110-300-0280"],
    category: "food"
  },
  {
    query: "Can I microwave baby bottles?",
    mustContain: ["microwave", "not", "warm"],
    correctSections: ["110-300-0280"],
    category: "food"
  },
  {
    query: "What temperature should the refrigerator be?",
    mustContain: ["41", "degrees"],
    correctSections: ["110-300-0270"],
    category: "food"
  },
  {
    query: "How long can leftover food be stored?",
    mustContain: ["48", "hour"],
    correctSections: ["110-300-0270"],
    category: "food"
  },
  {
    query: "What foods are choking hazards?",
    mustContain: ["chok"],
    correctSections: ["110-300-0285", "110-300-0165", "110-300-0295"],
    category: "food"
  },
  {
    query: "How should food be cut for infants?",
    mustContain: ["quarter inch"],
    correctSections: ["110-300-0285"],
    category: "food"
  },
  {
    query: "Can babies have juice?",
    mustContain: ["juice"],
    correctSections: ["110-300-0285"],
    category: "food"
  },

  // SAFETY
  {
    query: "How tall does a fence need to be?",
    mustContain: ["48", "inch", "fence"],
    correctSections: ["110-300-0145"],
    category: "safety"
  },
  {
    query: "What position should babies sleep in?",
    mustContain: ["back"],
    correctSections: ["110-300-0291"],
    category: "safety"
  },
  {
    query: "Can infants use blankets in cribs?",
    mustContain: ["blanket", "not", "crib"],
    correctSections: ["110-300-0291"],
    category: "safety"
  },
  {
    query: "How often should sleeping infants be checked?",
    mustContain: ["15", "minute"],
    correctSections: ["110-300-0291"],
    category: "safety"
  },
  {
    query: "What is the water temperature requirement?",
    mustContain: ["120"],
    correctSections: ["110-300-0165"],
    category: "safety"
  },

  // STAFFING
  {
    query: "How many infants per caregiver?",
    mustContain: ["1:4", "infant"],
    correctSections: ["110-300-0355", "110-300-0360"],
    category: "staffing"
  },
  {
    query: "What is the staff to child ratio for toddlers?",
    mustContain: ["1:7", "toddler"],
    correctSections: ["110-300-0355", "110-300-0360"],
    category: "staffing"
  },
  {
    query: "What training is required for staff?",
    mustContain: ["training", "hour"],
    correctSections: ["110-300-0100", "110-300-0105", "110-300-0106"],
    category: "staffing"
  },
  {
    query: "Do staff need background checks?",
    mustContain: ["background", "check"],
    correctSections: ["110-300-0100", "110-300-0105"],
    category: "staffing"
  },

  // HEALTH
  {
    query: "What fever requires sending a child home?",
    mustContain: ["101", "fever"],
    correctSections: ["110-300-0205", "110-300-0210"],
    category: "health"
  },
  {
    query: "When should hands be washed?",
    mustContain: ["wash", "hand"],
    correctSections: ["110-300-0180", "110-300-0185"],
    category: "health"
  },
  {
    query: "How should medication be stored?",
    mustContain: ["medication", "lock"],
    correctSections: ["110-300-0215"],
    category: "health"
  },
  {
    query: "What immunizations are required?",
    mustContain: ["immuniz"],
    correctSections: ["110-300-0200", "110-300-0205"],
    category: "health"
  },

  // FACILITIES
  {
    query: "How much indoor space per child?",
    mustContain: ["35", "square feet"],
    correctSections: ["110-300-0140"],
    category: "facilities"
  },
  {
    query: "What is the outdoor space requirement?",
    mustContain: ["75", "square feet"],
    correctSections: ["110-300-0145"],
    category: "facilities"
  },
  {
    query: "What temperature should the room be?",
    mustContain: ["68"],
    correctSections: ["110-300-0165"],
    category: "facilities"
  },

  // GENERAL
  {
    query: "How often are fire drills required?",
    mustContain: ["drill", "month"],
    correctSections: ["110-300-0470"],
    category: "general"
  },
  {
    query: "What discipline methods are prohibited?",
    mustContain: ["prohibit"],
    correctSections: ["110-300-0331"],
    category: "general"
  },
  {
    query: "Is timeout allowed?",
    mustContain: ["separation"],
    correctSections: ["110-300-0331"],
    category: "general"
  },
  {
    query: "Who can pick up my child?",
    mustContain: ["authorized"],
    correctSections: ["110-300-0345", "110-300-0350"],
    category: "general"
  },

  // ADDITIONAL TEST CASES
  {
    query: "Can I spank a child at daycare?",
    mustContain: ["prohibit", "corporal"],
    correctSections: ["110-300-0331"],
    category: "general"
  },
  {
    query: "How should breast milk be stored?",
    mustContain: ["breast milk", "refrigerat"],
    correctSections: ["110-300-0280"],
    category: "food"
  },
  {
    query: "Can babies sleep with stuffed animals?",
    mustContain: ["not", "stuff"],
    correctSections: ["110-300-0291"],
    category: "safety"
  },
  {
    query: "How long do you wash hands?",
    mustContain: ["20", "second"],
    correctSections: ["110-300-0180"],
    category: "health"
  },
  {
    query: "What is the preschool ratio?",
    mustContain: ["1:10"],
    correctSections: ["110-300-0355"],
    category: "staffing"
  },
  {
    query: "Do kids have to go outside?",
    mustContain: ["outdoor"],
    correctSections: ["110-300-0145"],
    category: "facilities"
  },
  {
    query: "Can staff give my child Tylenol?",
    mustContain: ["medication", "consent"],
    correctSections: ["110-300-0215"],
    category: "health"
  },
  {
    query: "What if a child is allergic to peanuts?",
    mustContain: ["allerg"],
    correctSections: ["110-300-0195"],
    category: "food"
  },
  {
    query: "How often do staff need training?",
    mustContain: ["training", "hour"],
    correctSections: ["110-300-0100", "110-300-0105", "110-300-0106"],
    category: "staffing"
  },
]

interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  content: string
}

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
}

const OLLAMA_URL = "http://localhost:11434/api/embed"
const MODEL = "embeddinggemma"
const TRUNCATE_DIM = 256

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: text }),
  })
  const data = (await response.json()) as { embeddings: number[][] }
  return data.embeddings[0].slice(0, TRUNCATE_DIM)
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function isRelevant(content: string, sectionId: string, testCase: TestCase): boolean {
  const lowerContent = content.toLowerCase()

  // Check if content contains all required keywords
  const hasKeywords = testCase.mustContain.every(kw =>
    lowerContent.includes(kw.toLowerCase())
  )

  // Check if section ID matches
  const hasSection = testCase.correctSections?.some(s => sectionId.startsWith(s)) ?? false

  // Relevant if has keywords OR matches section
  return hasKeywords || hasSection
}

interface SearchResult {
  content: string
  sectionId: string
  score: number
  source: "qa" | "content"
}

async function hybridSearch(
  query: string,
  qaPairs: QAPair[],
  qaEmbeddings: Map<string, number[]>,
  chunks: WacChunk[],
  chunkEmbeddings: Map<string, number[]>,
  topK: number = 5
): Promise<SearchResult[]> {
  const queryEmb = await getEmbedding(query)

  // Search Q&A
  const qaResults = qaPairs
    .map(qa => {
      const emb = qaEmbeddings.get(qa.question)
      if (!emb) return null
      return { qa, score: cosineSim(queryEmb, emb) }
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, 10) as { qa: QAPair; score: number }[]

  // Search content
  const contentResults = chunks
    .map(chunk => {
      const emb = chunkEmbeddings.get(chunk.chunkId)
      if (!emb) return null
      return { chunk, score: cosineSim(queryEmb, emb) }
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, 20) as { chunk: WacChunk; score: number }[]

  // RRF fusion with adaptive weighting
  const k = 60
  const bestQAScore = qaResults[0]?.score ?? 0
  const bestContentScore = contentResults[0]?.score ?? 0

  const fusedResults: { result: SearchResult; rrfScore: number }[] = []

  // Add Q&A results
  qaResults.forEach((r, rank) => {
    const weight = bestContentScore > bestQAScore ? 1.0 : 1.2
    fusedResults.push({
      result: {
        content: r.qa.answer,
        sectionId: r.qa.sectionId,
        score: r.score,
        source: "qa"
      },
      rrfScore: weight / (k + rank + 1)
    })
  })

  // Add content results
  contentResults.forEach((r, rank) => {
    fusedResults.push({
      result: {
        content: r.chunk.content,
        sectionId: r.chunk.id,
        score: r.score,
        source: "content"
      },
      rrfScore: 1.0 / (k + rank + 1)
    })
  })

  // Sort by RRF, then similarity as tie-breaker
  fusedResults.sort((a, b) => {
    const rrfDiff = b.rrfScore - a.rrfScore
    if (Math.abs(rrfDiff) > 0.0001) return rrfDiff
    return b.result.score - a.result.score
  })

  // Deduplicate by section
  const seen = new Set<string>()
  const results: SearchResult[] = []
  for (const { result } of fusedResults) {
    if (seen.has(result.sectionId)) continue
    seen.add(result.sectionId)
    results.push(result)
    if (results.length >= topK) break
  }

  return results
}

interface EvalResult {
  query: string
  category: string
  hit: boolean
  rank: number | null  // Rank of first relevant result (1-indexed), null if not found
  precision: number  // Fraction of top-K that are relevant
  results: { content: string; relevant: boolean; score: number; source: string }[]
}

async function evaluateQuery(
  testCase: TestCase,
  qaPairs: QAPair[],
  qaEmbeddings: Map<string, number[]>,
  chunks: WacChunk[],
  chunkEmbeddings: Map<string, number[]>,
  topK: number = 5
): Promise<EvalResult> {
  const results = await hybridSearch(
    testCase.query,
    qaPairs,
    qaEmbeddings,
    chunks,
    chunkEmbeddings,
    topK
  )

  const evalResults = results.map(r => ({
    content: r.content.slice(0, 100),
    relevant: isRelevant(r.content, r.sectionId, testCase),
    score: r.score,
    source: r.source
  }))

  const firstRelevantIndex = evalResults.findIndex(r => r.relevant)
  const relevantCount = evalResults.filter(r => r.relevant).length

  return {
    query: testCase.query,
    category: testCase.category,
    hit: firstRelevantIndex !== -1,
    rank: firstRelevantIndex !== -1 ? firstRelevantIndex + 1 : null,
    precision: relevantCount / topK,
    results: evalResults
  }
}

async function main() {
  console.log("Loading data...")

  // Load Q&A
  const qaPairs: QAPair[] = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/qa-pairs.json"), "utf-8")
  )
  const qaEmbData: { question: string; embedding: number[] }[] = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/qa-embeddings.json"), "utf-8")
  )
  const qaEmbeddings = new Map(qaEmbData.map(e => [e.question, e.embedding]))

  // Load chunks
  const chunks: WacChunk[] = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/chunks.json"), "utf-8")
  )
  const chunkEmbData: { chunkId: string; embedding: number[] }[] = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/embeddings.json"), "utf-8")
  )
  const chunkEmbeddings = new Map(chunkEmbData.map(e => [e.chunkId, e.embedding]))

  console.log(`Loaded ${qaPairs.length} Q&A pairs, ${chunks.length} chunks`)
  console.log(`Running ${TEST_CASES.length} test queries...\n`)

  const K = 5  // Evaluate top-5 results
  const results: EvalResult[] = []

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i]
    process.stdout.write(`\r  Testing ${i + 1}/${TEST_CASES.length}: ${testCase.query.slice(0, 40)}...`)
    const result = await evaluateQuery(testCase, qaPairs, qaEmbeddings, chunks, chunkEmbeddings, K)
    results.push(result)
  }
  console.log("\n")

  // Calculate overall metrics
  const hitCount = results.filter(r => r.hit).length
  const hitRate = hitCount / results.length

  const mrr = results.reduce((sum, r) => {
    return sum + (r.rank ? 1 / r.rank : 0)
  }, 0) / results.length

  const avgPrecision = results.reduce((sum, r) => sum + r.precision, 0) / results.length

  // Calculate by category
  const categories = ["food", "safety", "staffing", "health", "facilities", "general"]
  const categoryMetrics = categories.map(cat => {
    const catResults = results.filter(r => r.category === cat)
    if (catResults.length === 0) return null
    return {
      category: cat,
      count: catResults.length,
      hitRate: catResults.filter(r => r.hit).length / catResults.length,
      mrr: catResults.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / catResults.length,
      avgPrecision: catResults.reduce((sum, r) => sum + r.precision, 0) / catResults.length
    }
  }).filter(Boolean)

  // Print results
  console.log("=" .repeat(70))
  console.log("SEARCH QUALITY EVALUATION REPORT")
  console.log("=".repeat(70))
  console.log()
  console.log(`Test queries: ${TEST_CASES.length}`)
  console.log(`Top-K evaluated: ${K}`)
  console.log()
  console.log("OVERALL METRICS")
  console.log("-".repeat(40))
  console.log(`Hit Rate@${K}:     ${(hitRate * 100).toFixed(1)}%  (${hitCount}/${results.length} queries found relevant result)`)
  console.log(`MRR:              ${mrr.toFixed(3)}  (Mean Reciprocal Rank)`)
  console.log(`Avg Precision@${K}: ${(avgPrecision * 100).toFixed(1)}%`)
  console.log()

  console.log("METRICS BY CATEGORY")
  console.log("-".repeat(40))
  console.log("Category      | Queries | Hit Rate | MRR   | Precision")
  console.log("-".repeat(55))
  for (const m of categoryMetrics) {
    if (!m) continue
    console.log(
      `${m.category.padEnd(13)} | ${String(m.count).padStart(7)} | ${(m.hitRate * 100).toFixed(0).padStart(6)}%  | ${m.mrr.toFixed(3)} | ${(m.avgPrecision * 100).toFixed(0)}%`
    )
  }
  console.log()

  // Show failed queries
  const failed = results.filter(r => !r.hit)
  if (failed.length > 0) {
    console.log("FAILED QUERIES (no relevant result in top-5)")
    console.log("-".repeat(40))
    for (const f of failed) {
      console.log(`  ❌ "${f.query}"`)
      console.log(`     Top result: ${f.results[0]?.content}...`)
    }
    console.log()
  }

  // Show queries where relevant result wasn't #1
  const notFirst = results.filter(r => r.hit && r.rank && r.rank > 1)
  if (notFirst.length > 0) {
    console.log("QUERIES WHERE RELEVANT RESULT WASN'T #1")
    console.log("-".repeat(40))
    for (const n of notFirst) {
      console.log(`  ⚠️  "${n.query}" - relevant at rank #${n.rank}`)
    }
    console.log()
  }

  // Summary grade
  console.log("SUMMARY")
  console.log("-".repeat(40))
  let grade = "F"
  if (hitRate >= 0.95 && mrr >= 0.9) grade = "A+"
  else if (hitRate >= 0.90 && mrr >= 0.8) grade = "A"
  else if (hitRate >= 0.85 && mrr >= 0.7) grade = "B+"
  else if (hitRate >= 0.80 && mrr >= 0.6) grade = "B"
  else if (hitRate >= 0.70 && mrr >= 0.5) grade = "C"
  else if (hitRate >= 0.60) grade = "D"

  console.log(`Overall Grade: ${grade}`)
  console.log()
  console.log("Interpretation:")
  console.log("  Hit Rate: % of queries that found a relevant answer in top 5")
  console.log("  MRR: How high relevant answers rank (1.0 = always first)")
  console.log("  Precision: % of top-5 results that are relevant")
}

main().catch(console.error)
