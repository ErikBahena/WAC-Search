import { readFileSync } from "fs"
import { join } from "path"

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
}

interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  content: string
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

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

async function testQuery(
  query: string,
  qaPairs: QAPair[],
  qaEmbeddings: Map<string, number[]>,
  chunks: WacChunk[],
  chunkEmbeddings: Map<string, number[]>
) {
  const queryEmbedding = await getEmbedding(query)

  // Search Q&A
  let bestQA = { score: 0, qa: null as QAPair | null }
  for (const qa of qaPairs) {
    const emb = qaEmbeddings.get(qa.question)
    if (!emb) continue
    const score = cosineSimilarity(queryEmbedding, emb)
    if (score > bestQA.score) bestQA = { score, qa }
  }

  // Search content
  let bestContent = { score: 0, chunk: null as WacChunk | null }
  for (const chunk of chunks) {
    const emb = chunkEmbeddings.get(chunk.chunkId)
    if (!emb) continue
    const score = cosineSimilarity(queryEmbedding, emb)
    if (score > bestContent.score) bestContent = { score, chunk }
  }

  const winner = bestQA.score * 1.5 / 61 > bestContent.score / 61 ? "Q&A" : "Content"
  const diff = (bestQA.score - bestContent.score).toFixed(4)

  console.log(`\n"${query}"`)
  console.log(`  Q&A:     ${bestQA.score.toFixed(4)} - ${bestQA.qa?.sectionTitle}`)
  console.log(`  Content: ${bestContent.score.toFixed(4)} - ${bestContent.chunk?.sectionTitle}`)
  console.log(`  Winner: ${winner} (diff: ${diff})`)
}

async function main() {
  const qaPairs: QAPair[] = JSON.parse(readFileSync(join(process.cwd(), "public/data/qa-pairs.json"), "utf-8"))
  const qaEmb: { question: string; embedding: number[] }[] = JSON.parse(readFileSync(join(process.cwd(), "public/data/qa-embeddings.json"), "utf-8"))
  const qaEmbeddings = new Map(qaEmb.map((e) => [e.question, e.embedding]))

  const chunks: WacChunk[] = JSON.parse(readFileSync(join(process.cwd(), "public/data/chunks.json"), "utf-8"))
  const chunkEmb: { chunkId: string; embedding: number[] }[] = JSON.parse(readFileSync(join(process.cwd(), "public/data/embeddings.json"), "utf-8"))
  const chunkEmbeddings = new Map(chunkEmb.map((e) => [e.chunkId, e.embedding]))

  console.log("Testing edge cases where content might beat Q&A...\n")

  // Edge case queries - very specific regulatory questions
  const queries = [
    "What is the definition of 'early learning program'?",
    "How many square feet per child indoors?",
    "What are the requirements for toileting areas?",
    "Fire drill frequency requirements",
    "Background check requirements for staff",
    "What is WAC 110-300-0100?",
    "First aid kit contents",
    "Transportation requirements for field trips",
    "What records must be kept for each child?",
    "Medication administration requirements",
  ]

  for (const q of queries) {
    await testQuery(q, qaPairs, qaEmbeddings, chunks, chunkEmbeddings)
  }
}

main().catch(console.error)
