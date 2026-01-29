import { readFileSync } from "fs"
import { join } from "path"

// Load chunks and embeddings
const chunksPath = join(process.cwd(), "public", "data", "chunks.json")
const embeddingsPath = join(process.cwd(), "public", "data", "embeddings.json")

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

const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))
const embeddingsData: { chunkId: string; embedding: number[] }[] = JSON.parse(
  readFileSync(embeddingsPath, "utf-8")
)
const embeddings = new Map(embeddingsData.map((e) => [e.chunkId, e.embedding]))

// BM25 Implementation
class BM25 {
  private k1 = 1.5
  private b = 0.75
  private avgDocLength = 0
  private docLengths: number[] = []
  private termFreqs: Map<string, number[]> = new Map()
  private docFreqs: Map<string, number> = new Map()
  private numDocs = 0

  tokenize(text: string): string[] {
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
      this.docLengths.reduce((a, b) => a + b, 0) / this.numDocs
  }

  search(query: string): number[] {
    const queryTokens = this.tokenize(query)
    const scores = new Array(this.numDocs).fill(0)

    for (const term of queryTokens) {
      const docFreq = this.docFreqs.get(term) || 0
      if (docFreq === 0) continue

      const idf = Math.log(
        (this.numDocs - docFreq + 0.5) / (docFreq + 0.5) + 1
      )
      const termFreqArray = this.termFreqs.get(term)!

      for (let i = 0; i < this.numDocs; i++) {
        const tf = termFreqArray[i]
        if (tf === 0) continue

        const docLength = this.docLengths[i]
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf +
            this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)))
        scores[i] += idf * tfNorm
      }
    }

    return scores
  }
}

// Build BM25 index
const bm25 = new BM25()
bm25.index(chunks.map((c) => `${c.sectionTitle} ${c.content}`))

// Cosine similarity
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

// RRF with weights
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

// Time intent detection
const TIME_KEYWORDS = [
  "how long",
  "how many hours",
  "how many minutes",
  "time",
  "duration",
  "expire",
  "safe for",
  "keep",
  "store",
  "last",
]
const TIME_CONTENT_KEYWORDS = [
  "hour",
  "minute",
  "day",
  "week",
  "month",
  "within",
  "before",
  "after",
  "expire",
]

function hasTimeIntent(query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return TIME_KEYWORDS.some((kw) => lowerQuery.includes(kw))
}

function hasTimeContent(content: string): boolean {
  const lowerContent = content.toLowerCase()
  return TIME_CONTENT_KEYWORDS.some((kw) => lowerContent.includes(kw))
}

// Generate query embedding using Ollama
async function getQueryEmbedding(query: string): Promise<number[]> {
  const response = await fetch("http://localhost:11434/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "twine/mxbai-embed-xsmall-v1",
      input: query,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`)
  }

  const data = (await response.json()) as { embeddings: number[][] }
  return data.embeddings[0]
}

// Search function
async function search(
  query: string,
  topK = 5
): Promise<{ chunk: WacChunk; score: number }[]> {
  // Expand query with synonyms
  const expandedQuery = expandQuery(query)

  // Semantic search with expanded query
  const queryEmbedding = await getQueryEmbedding(expandedQuery)

  const semanticScores: { index: number; score: number }[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const chunkEmbedding = embeddings.get(chunk.chunkId)
    if (!chunkEmbedding) continue

    const score = cosineSimilarity(queryEmbedding, chunkEmbedding)
    semanticScores.push({ index: i, score })
  }

  // BM25 search with expanded query
  const bm25Scores = bm25.search(expandedQuery)
  const bm25Results: { index: number; score: number }[] = []
  for (let i = 0; i < bm25Scores.length; i++) {
    if (bm25Scores[i] > 0) {
      bm25Results.push({ index: i, score: bm25Scores[i] })
    }
  }

  // RRF fusion - weight semantic higher for QA
  const fusedScores = reciprocalRankFusion([semanticScores, bm25Results], [1.5, 1.0])

  // Apply boosts
  const queryHasTimeIntent = hasTimeIntent(query)

  const results: { chunk: WacChunk; score: number }[] = []
  for (const [index, fusedScore] of fusedScores) {
    const chunk = chunks[index]
    let score = fusedScore

    if (queryHasTimeIntent && hasTimeContent(chunk.content)) {
      score *= 1.2
    }

    results.push({ chunk, score })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}

// Synonyms for query expansion (must match src/lib/search.ts)
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

function expandQuery(query: string): string {
  let expanded = query.toLowerCase()
  for (const [term, synonyms] of Object.entries(SYNONYMS)) {
    if (expanded.includes(term)) {
      expanded += " " + synonyms.join(" ")
    }
  }
  return expanded
}

// Test cases with expected answers
const testCases = [
  {
    query: "How long can a bottle sit out before refrigerating?",
    expectedKeywords: ["one hour", "formula", "bottle"],
    expectedChunkId: "110-300-0280-3l",
  },
  {
    query: "How long can leftover food be stored?",
    expectedKeywords: ["forty-eight hours", "leftover", "refrigerated"],
    expectedSection: "110-300-0197",
  },
  {
    query: "What is the staff to child ratio for infants?",
    expectedKeywords: ["ratio", "infant", "staff"],
    expectedSection: "110-300-0350",
  },
  {
    query: "What temperature should the refrigerator be?",
    expectedKeywords: ["41 degrees", "refrigerat"],
    expectedSection: "110-300-0197",
  },
  {
    query: "Can infants sleep in swings?",
    expectedKeywords: ["infant", "sleep", "swing"],
    expectedSection: "110-300-0290",
  },
  {
    query: "What training is required for staff?",
    expectedKeywords: ["training", "staff"],
    expectedSection: "110-300-0110",
  },
  {
    query: "How much outdoor play space is required per child?",
    expectedKeywords: ["outdoor", "square feet", "seventy-five"],
    expectedSection: "110-300-0145",
  },
  {
    query: "When should hands be washed?",
    expectedKeywords: ["wash", "hand"],
    expectedSection: "110-300-0200",
  },
  {
    query: "What immunizations are required?",
    expectedKeywords: ["immunization"],
    expectedSection: "110-300-0210",
  },
  {
    query: "How should medication be stored?",
    expectedKeywords: ["medication", "store"],
    expectedSection: "110-300-0215",
  },
  {
    query: "What are the requirements for cribs?",
    expectedKeywords: ["crib"],
    expectedSection: "110-300-0290",
  },
  {
    query: "fire drill requirements",
    expectedKeywords: ["fire", "drill"],
    expectedSection: "110-300-0470",
  },
  {
    query: "background check requirements",
    expectedKeywords: ["background", "check"],
    expectedSection: "110-300-0100",
  },
  {
    query: "What is the fence height requirement?",
    expectedKeywords: ["fence", "height", "inch"],
    expectedSection: "110-300-0145",
  },
  {
    query: "How many square feet per child indoors?",
    expectedKeywords: ["square feet", "child"],
    expectedSection: "110-300-0140",
  },
  {
    query: "Can I use a car seat for sleeping?",
    expectedKeywords: ["car seat", "sleep"],
    expectedSection: "110-300-0290",
  },
  {
    query: "What is the maximum group size for toddlers?",
    expectedKeywords: ["group size", "toddler"],
    expectedSection: "110-300-0355",
  },
  {
    query: "When should I call 911?",
    expectedKeywords: ["911", "emergency"],
    expectedSection: "110-300-0475",
  },
  // Additional edge cases
  {
    query: "breast milk storage",
    expectedKeywords: ["breast milk"],
    expectedSection: "110-300-0281",
  },
  {
    query: "how to sanitize toys",
    expectedKeywords: ["sanitiz", "toy"],
    expectedSection: "110-300-0241",
  },
  {
    query: "what should be in a first aid kit",
    expectedKeywords: ["first-aid", "kit"],
    expectedSection: "110-300-0230",
  },
  {
    query: "what if a child gets sick",
    expectedKeywords: ["ill", "child"],
    expectedSection: "110-300-0205",
  },
  {
    query: "supervision requirements",
    expectedKeywords: ["supervis"],
    expectedSection: "110-300-0110",
  },
  {
    query: "infant sleep requirements",
    expectedKeywords: ["sleep", "infant"],
    expectedSection: "110-300-0290",
  },
  {
    query: "swimming pool safety requirements",
    expectedKeywords: ["water", "pool", "swim"],
    expectedSection: "110-300-0175",
  },
  // Hard queries that require synonym understanding
  {
    query: "how long is a puree good for after it's been opened",
    expectedKeywords: ["leftover", "forty-eight hours", "refrigerated"],
    expectedSection: "110-300-0197",
  },
  {
    query: "can kids share sippy cups",
    expectedKeywords: ["share", "bottle", "cup"],
    expectedSection: "110-300-0280",
  },
  {
    query: "when do I need to throw out formula",
    expectedKeywords: ["formula", "hour", "throw"],
    expectedSection: "110-300-0280",
  },
  {
    query: "rules about giving kids tylenol",
    expectedKeywords: ["medication"],
    expectedSection: "110-300-0215",
  },
  {
    query: "how warm should the room be",
    expectedKeywords: ["temperature", "degrees"],
    expectedSection: "110-300-0160",
  },
  {
    query: "application materials for licensing",
    expectedKeywords: ["application", "material"],
    expectedSection: "110-300-0400",
  },
  {
    query: "how many kids can one teacher watch",
    expectedKeywords: ["ratio", "staff", "child"],
    expectedSection: "110-300-0355",
  },
  {
    query: "rules for tv and screen time",
    expectedKeywords: ["screen", "television"],
    expectedSection: "110-300-0155",
  },
  {
    query: "what happens if a kid bites another kid",
    expectedKeywords: ["bite", "child"],
    expectedSection: "110-300-0296",
  },
  {
    query: "can I give a child melatonin",
    expectedKeywords: ["medication", "sleep"],
    expectedSection: "110-300-0215",
  },
  // Really hard natural language queries
  {
    query: "is it ok to let babies nap in bouncers",
    expectedKeywords: ["sleep", "infant", "equipment"],
    expectedSection: "110-300-0290",
  },
  {
    query: "what do I do during a fire",
    expectedKeywords: ["evacuat", "emergency", "preparedness"],
    expectedSection: "110-300-0470",
  },
  {
    query: "potty training tips",
    expectedKeywords: ["toilet", "training"],
    expectedSection: "110-300-0220",
  },
  {
    query: "can parents bring food from home",
    expectedKeywords: ["parent", "food", "home"],
    expectedSection: "110-300-0186",
  },
  {
    query: "how do I report abuse",
    expectedKeywords: ["report", "abuse"],
    expectedSection: "110-300-0475",
  },
  {
    query: "allergies policy",
    expectedKeywords: ["allerg"],
    expectedSection: "110-300-0186",
  },
  {
    query: "can I have pets at daycare",
    expectedKeywords: ["animal", "pet"],
    expectedSection: "110-300-0180",
  },
  {
    query: "how old does a crib mattress need to be",
    expectedKeywords: ["crib", "mattress"],
    expectedSection: "110-300-0290",
  },
  {
    query: "when can toddlers stop using cribs",
    expectedKeywords: ["crib", "toddler", "sleep"],
    expectedSection: "110-300-0290",
  },
  {
    query: "outdoor playground equipment safety",
    expectedKeywords: ["outdoor", "equipment", "safe"],
    expectedSection: "110-300-0146",
  },
  // ============================================
  // EXTREME EDGE CASES - Misspellings
  // ============================================
  {
    query: "fridge temprature",
    expectedKeywords: ["refrigerat", "degrees"],
    expectedSection: "110-300-0197",
  },
  {
    query: "immunizations required for children",
    expectedKeywords: ["immuniz"],
    expectedSection: "110-300-0210",
  },
  {
    query: "safety rules",
    expectedKeywords: ["safe"],
    expectedSection: "110-300-0165",
  },
  // ============================================
  // EXTREME EDGE CASES - Very casual language
  // ============================================
  {
    query: "how to calm a crying baby",
    expectedKeywords: ["infant", "child", "comfort"],
    expectedSection: "110-300-0135",
  },
  {
    query: "safe sleep for infants",
    expectedKeywords: ["sleep", "infant", "safe"],
    expectedSection: "110-300-0291",
  },
  {
    query: "snack rules",
    expectedKeywords: ["food", "snack", "meal"],
    expectedSection: "110-300-0180",
  },
  {
    query: "naptime rules",
    expectedKeywords: ["sleep", "rest"],
    expectedSection: "110-300-0290",
  },
  {
    query: "diaper duty",
    expectedKeywords: ["diaper", "chang"],
    expectedSection: "110-300-0220",
  },
  {
    query: "outside time",
    expectedKeywords: ["outdoor", "play"],
    expectedSection: "110-300-0145",
  },
  {
    query: "boo boos and owies",
    expectedKeywords: ["injur", "first-aid"],
    expectedSection: "110-300-0230",
  },
  // ============================================
  // EXTREME EDGE CASES - Single word queries
  // ============================================
  {
    query: "staff child ratios",
    expectedKeywords: ["ratio", "staff", "child"],
    expectedSection: "110-300-0350",
  },
  {
    query: "bottles",
    expectedKeywords: ["bottle"],
    expectedSection: "110-300-0280",
  },
  {
    query: "diapers",
    expectedKeywords: ["diaper"],
    expectedSection: "110-300-0220",
  },
  {
    query: "handwashing",
    expectedKeywords: ["wash", "hand"],
    expectedSection: "110-300-0200",
  },
  {
    query: "sunscreen",
    expectedKeywords: ["sunscreen"],
    expectedSection: "110-300-0215",
  },
  // ============================================
  // EXTREME EDGE CASES - Age-specific queries
  // ============================================
  {
    query: "rules for 2 year olds",
    expectedKeywords: ["toddler", "child"],
    expectedSection: "110-300-0275",
  },
  {
    query: "infants under 12 months",
    expectedKeywords: ["infant"],
    expectedSection: "110-300-0275",
  },
  {
    query: "newborn care",
    expectedKeywords: ["infant"],
    expectedSection: "110-300-0275",
  },
  {
    query: "preschool age requirements",
    expectedKeywords: ["child", "preschool"],
    expectedSection: "110-300-0305",
  },
  // ============================================
  // EXTREME EDGE CASES - Specific scenarios
  // ============================================
  {
    query: "field trip permission",
    expectedKeywords: ["off-site", "transport", "parent"],
    expectedSection: "110-300-0265",
  },
  {
    query: "water activities and swimming rules",
    expectedKeywords: ["water", "swim", "pool"],
    expectedSection: "110-300-0175",
  },
  {
    query: "overnight care requirements",
    expectedKeywords: ["overnight", "sleep"],
    expectedSection: "110-300-0270",
  },
  {
    query: "parent sign in sign out requirements",
    expectedKeywords: ["sign", "parent"],
    expectedSection: "110-300-0450",
  },
  {
    query: "parent access to program",
    expectedKeywords: ["parent", "access"],
    expectedSection: "110-300-0450",
  },
  {
    query: "emergency procedures missing child",
    expectedKeywords: ["emergency", "child"],
    expectedSection: "110-300-0470",
  },
  // ============================================
  // EXTREME EDGE CASES - Food specific
  // ============================================
  {
    query: "warming baby food",
    expectedKeywords: ["food", "infant"],
    expectedSection: "110-300-0280",
  },
  {
    query: "beverages for children",
    expectedKeywords: ["beverage", "drink", "fluid"],
    expectedSection: "110-300-0180",
  },
  {
    query: "food allergy policy",
    expectedKeywords: ["allerg", "food"],
    expectedSection: "110-300-0186",
  },
  {
    query: "food choking hazards for children",
    expectedKeywords: ["food", "safe", "age"],
    expectedSection: "110-300-0180",
  },
  {
    query: "when to throw out milk",
    expectedKeywords: ["milk", "refrigerat", "hour"],
    expectedSection: "110-300-0281",
  },
  // ============================================
  // EXTREME EDGE CASES - Health specific
  // ============================================
  {
    query: "when to send sick child home",
    expectedKeywords: ["ill", "child", "home"],
    expectedSection: "110-300-0205",
  },
  {
    query: "when to exclude sick children",
    expectedKeywords: ["ill", "exclud"],
    expectedSection: "110-300-0205",
  },
  {
    query: "fever threshold",
    expectedKeywords: ["ill", "temperature", "fever"],
    expectedSection: "110-300-0205",
  },
  {
    query: "can a sick teacher come to work",
    expectedKeywords: ["ill", "staff"],
    expectedSection: "110-300-0205",
  },
  {
    query: "emergency medication administration",
    expectedKeywords: ["medication", "emergency"],
    expectedSection: "110-300-0215",
  },
  // ============================================
  // EXTREME EDGE CASES - Facilities
  // ============================================
  {
    query: "toilet and bathroom requirements",
    expectedKeywords: ["toilet", "bathroom"],
    expectedSection: "110-300-0220",
  },
  {
    query: "how many toilets do I need",
    expectedKeywords: ["toilet", "bathroom"],
    expectedSection: "110-300-0220",
  },
  {
    query: "diaper changing table rules",
    expectedKeywords: ["diaper", "chang", "sanitiz"],
    expectedSection: "110-300-0241",
  },
  {
    query: "food preparation area requirements",
    expectedKeywords: ["food", "prepar"],
    expectedSection: "110-300-0197",
  },
  {
    query: "infant sleep room requirements",
    expectedKeywords: ["sleep", "infant", "crib"],
    expectedSection: "110-300-0290",
  },
  // ============================================
  // EXTREME EDGE CASES - Staff/HR
  // ============================================
  {
    query: "volunteer supervision requirements",
    expectedKeywords: ["volunteer", "supervis"],
    expectedSection: "110-300-0100",
  },
  {
    query: "minimum age for daycare staff",
    expectedKeywords: ["age", "staff"],
    expectedSection: "110-300-0100",
  },
  {
    query: "CPR certification",
    expectedKeywords: ["CPR", "first-aid", "certif"],
    expectedSection: "110-300-0230",
  },
  {
    query: "staff training and qualifications",
    expectedKeywords: ["qualif", "train", "staff"],
    expectedSection: "110-300-0100",
  },
  {
    query: "background check fingerprint requirements",
    expectedKeywords: ["background", "fingerprint"],
    expectedSection: "110-300-0100",
  },
  // ============================================
  // EXTREME EDGE CASES - Behavioral
  // ============================================
  {
    query: "child guidance and behavior",
    expectedKeywords: ["guidance", "behavior"],
    expectedSection: "110-300-0330",
  },
  {
    query: "prohibited discipline methods",
    expectedKeywords: ["discipline", "prohibit"],
    expectedSection: "110-300-0331",
  },
  {
    query: "physical discipline not allowed",
    expectedKeywords: ["prohibit", "discipline", "physical"],
    expectedSection: "110-300-0331",
  },
  {
    query: "child behavior guidance",
    expectedKeywords: ["behavior", "guidance", "child"],
    expectedSection: "110-300-0330",
  },
  // ============================================
  // EXTREME EDGE CASES - Weird phrasing
  // ============================================
  {
    query: "formula sitting out too long",
    expectedKeywords: ["formula", "bottle", "hour"],
    expectedSection: "110-300-0280",
  },
  {
    query: "babies sleeping face down",
    expectedKeywords: ["sleep", "back", "infant"],
    expectedSection: "110-300-0291",
  },
  {
    query: "no blankets in cribs safe sleep",
    expectedKeywords: ["crib", "sleep", "infant"],
    expectedSection: "110-300-0291",
  },
  {
    query: "child release and pickup authorization",
    expectedKeywords: ["release", "authoriz", "parent"],
    expectedSection: "110-300-0450",
  },
  {
    query: "earthquake emergency drill requirements",
    expectedKeywords: ["earthquake", "drill", "emergency"],
    expectedSection: "110-300-0470",
  },
  {
    query: "smoke detector requirements",
    expectedKeywords: ["smoke", "detector", "fire"],
    expectedSection: "110-300-0170",
  },
  // ============================================
  // EXTREME EDGE CASES - Questions parents actually ask
  // ============================================
  {
    query: "enforcement actions and penalties",
    expectedKeywords: ["enforce", "action"],
    expectedSection: "110-300-0443",
  },
  {
    query: "reporting incidents to department",
    expectedKeywords: ["report", "department", "incident"],
    expectedSection: "110-300-0475",
  },
  {
    query: "what documents do I need to apply",
    expectedKeywords: ["application", "document"],
    expectedSection: "110-300-0400",
  },
  {
    query: "my child came home with a bruise",
    expectedKeywords: ["injur", "incident", "report"],
    expectedSection: "110-300-0475",
  },
  {
    query: "daily schedule requirements",
    expectedKeywords: ["schedule", "routine", "activity"],
    expectedSection: "110-300-0135",
  },
  {
    query: "safe materials for children",
    expectedKeywords: ["material", "safe", "toxic"],
    expectedSection: "110-300-0165",
  },
]

async function runTests() {
  console.log("Running search quality tests...\n")
  console.log("=".repeat(80))

  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    console.log(`\nQuery: "${testCase.query}"`)

    try {
      const results = await search(testCase.query, 3)

      const topResult = results[0]
      const topContent = topResult.chunk.content.toLowerCase()
      const topTitle = topResult.chunk.sectionTitle.toLowerCase()

      // Check if expected keywords are in the top result
      const foundKeywords = testCase.expectedKeywords.filter(
        (kw) => topContent.includes(kw.toLowerCase()) || topTitle.includes(kw.toLowerCase())
      )

      // Check if expected section/chunk matches
      const sectionMatch = testCase.expectedSection
        ? topResult.chunk.id === testCase.expectedSection
        : true
      const chunkMatch = testCase.expectedChunkId
        ? topResult.chunk.chunkId === testCase.expectedChunkId
        : true

      const keywordScore = foundKeywords.length / testCase.expectedKeywords.length
      const isPass = keywordScore >= 0.5 && (sectionMatch || chunkMatch || keywordScore >= 0.7)

      if (isPass) {
        console.log(`✅ PASS`)
        passed++
      } else {
        console.log(`❌ FAIL`)
        failed++
      }

      console.log(`   Top Result: ${topResult.chunk.sectionTitle} ${topResult.chunk.subsectionPath}`)
      console.log(`   Section: ${topResult.chunk.id} | ChunkID: ${topResult.chunk.chunkId}`)
      console.log(`   Content: ${topResult.chunk.content.substring(0, 150)}...`)
      console.log(`   Keywords found: ${foundKeywords.join(", ")} (${Math.round(keywordScore * 100)}%)`)

      if (results.length > 1) {
        console.log(`   2nd: ${results[1].chunk.sectionTitle} ${results[1].chunk.subsectionPath}`)
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error}`)
      failed++
    }
  }

  console.log("\n" + "=".repeat(80))
  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests`)
  console.log(`Pass rate: ${Math.round((passed / testCases.length) * 100)}%`)
}

runTests().catch(console.error)
