import { readFileSync } from "fs"
import { join } from "path"

interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  content: string
  embeddingText: string
}

const chunks: WacChunk[] = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/chunks.json"), "utf-8")
)
const embeddings: { chunkId: string }[] = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/embeddings.json"), "utf-8")
)

const embeddingIds = new Set(embeddings.map((e) => e.chunkId))
const missingChunks = chunks.filter((c) => !embeddingIds.has(c.chunkId))

console.log("Missing embeddings for", missingChunks.length, "chunks")
console.log("First 5 missing:")
missingChunks.slice(0, 5).forEach((c) => {
  console.log(" -", c.chunkId, ":", c.sectionTitle)
})

// Check if any chunks mention 'chok' or 'hazard'
const chokingChunks = chunks.filter(
  (c) =>
    c.content.toLowerCase().includes("chok") ||
    c.content.toLowerCase().includes("hazard") ||
    c.embeddingText.toLowerCase().includes("chok")
)
console.log("\nChunks mentioning choking/hazard:", chokingChunks.length)
chokingChunks.slice(0, 5).forEach((c) => {
  console.log("\n---", c.sectionTitle, "---")
  console.log(c.content.slice(0, 400))
})
