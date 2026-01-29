import { readFileSync } from "fs"
import { join } from "path"

// Test fact extraction on a few key sections

const testSections = [
  "110-300-0280", // Bottle preparation
  "110-300-0197", // Safe food practices
  "110-300-0356", // Staff ratios
  "110-300-0291", // Infant safe sleep
]

interface WacChunk {
  id: string
  sectionTitle: string
  fullContent: string
  url: string
}

async function extractFacts(sectionId: string, title: string, content: string) {
  const prompt = `Extract specific facts from this childcare regulation. Focus on:
- Time limits (hours, minutes, days)
- Ratios (staff:children)
- Temperatures (degrees)
- Measurements (feet, inches)
- Age limits
- Yes/No rules

For each fact, output JSON with:
- fact: The specific value
- applies_to: What it applies to
- action: What to do (optional)
- context: Extra info (optional)
- queries: 2-3 questions someone would ask

Section: WAC ${sectionId} - ${title}
${content.substring(0, 2500)}

Return ONLY a JSON array of facts. Be specific and concise.`

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemma3:4b",
      prompt,
      stream: false,
      options: { temperature: 0.1 }
    }),
  })

  const data = await response.json() as { response: string }
  return data.response
}

async function main() {
  const chunksPath = join(process.cwd(), "public", "data", "chunks.json")
  const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))

  // Get unique sections
  const sections = new Map<string, WacChunk>()
  for (const chunk of chunks) {
    if (testSections.includes(chunk.id) && !sections.has(chunk.id)) {
      sections.set(chunk.id, chunk)
    }
  }

  for (const [id, chunk] of sections) {
    console.log(`\n${"=".repeat(80)}`)
    console.log(`Section: ${id} - ${chunk.sectionTitle}`)
    console.log("=".repeat(80))

    const result = await extractFacts(id, chunk.sectionTitle, chunk.fullContent)
    console.log(result)
  }
}

main().catch(console.error)
