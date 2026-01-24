import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

interface WacSection {
  id: string
  title: string
  content: string
  url: string
  category: string
}

interface EmbeddingResult {
  id: string
  embedding: number[]
}

const OLLAMA_URL = "http://localhost:11434/api/embed"
const MODEL = "twine/mxbai-embed-xsmall-v1"

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`)
  }

  const data = await response.json() as { embeddings: number[][] }
  return data.embeddings[0]
}

async function embedSections(): Promise<void> {
  const sectionsPath = join(process.cwd(), "public", "data", "sections.json")
  const sections: WacSection[] = JSON.parse(readFileSync(sectionsPath, "utf-8"))

  console.log(`Embedding ${sections.length} sections...`)

  const results: EmbeddingResult[] = []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const text = `${section.title}\n\n${section.content}`.substring(0, 2000)

    try {
      const embedding = await getEmbedding(text)
      results.push({ id: section.id, embedding })

      if ((i + 1) % 10 === 0) {
        console.log(`  ${i + 1}/${sections.length}`)
      }
    } catch (error) {
      console.error(`Failed to embed ${section.id}:`, error)
    }
  }

  const outPath = join(process.cwd(), "public", "data", "embeddings.json")
  writeFileSync(outPath, JSON.stringify(results))

  console.log(`Wrote ${results.length} embeddings to ${outPath}`)
}

embedSections().catch(console.error)
