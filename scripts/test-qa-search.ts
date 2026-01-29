import { readFileSync } from "fs"
import { join } from "path"

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

const qaPath = join(process.cwd(), "public", "data", "qa-pairs.json")
const qaEmbeddingsPath = join(process.cwd(), "public", "data", "qa-embeddings.json")

const qaPairs: QAPair[] = JSON.parse(readFileSync(qaPath, "utf-8"))
const qaEmbeddings: { question: string; embedding: number[] }[] = JSON.parse(
  readFileSync(qaEmbeddingsPath, "utf-8")
)

// Create a map from question to QA pair
const questionToQA = new Map(qaPairs.map((qa) => [qa.question, qa]))

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0,
    normA = 0,
    normB = 0
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

async function searchQA(query: string, topK = 3) {
  const queryEmbedding = await getQueryEmbedding(query)

  const results = qaEmbeddings
    .map((qa) => ({
      question: qa.question,
      score: cosineSimilarity(queryEmbedding, qa.embedding),
      qa: questionToQA.get(qa.question)!,
    }))
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
  console.log("Testing Q&A-Based Search")
  console.log("=".repeat(100))

  for (const q of quickQuestions) {
    console.log(`\n[${q.label}]`)
    console.log(`Query: "${q.query}"`)
    console.log("-".repeat(100))

    const results = await searchQA(q.query, 3)

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      console.log(`\n#${i + 1} (${(r.score * 100).toFixed(1)}% match)`)
      console.log(`   Q: ${r.question}`)
      console.log(`   A: ${r.qa.answer}`)
      console.log(`   Source: WAC ${r.qa.sectionId}`)
    }
    console.log("\n" + "=".repeat(100))
  }
}

main().catch(console.error)
