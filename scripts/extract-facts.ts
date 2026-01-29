import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

interface WacChunk {
  id: string
  sectionTitle: string
  content: string
  fullContent: string
  url: string
}

interface ExtractedFact {
  fact: string
  applies_to: string
  action?: string
  context?: string
  source: string
  sourceTitle: string
  sourceUrl: string
  // For embedding - natural language query this fact answers
  searchQueries: string[]
}

async function extractFactsFromSection(
  sectionId: string,
  title: string,
  content: string,
  url: string
): Promise<ExtractedFact[]> {
  const prompt = `Extract specific facts from this childcare regulation. Focus on:
- Time limits (hours, minutes, days)
- Ratios (staff:children)
- Temperatures (degrees)
- Measurements (feet, inches, square feet)
- Age requirements
- Yes/No rules

For each fact, provide:
- fact: The specific number/value/rule
- applies_to: What this fact applies to
- action: What to do (if applicable)
- context: Additional important context
- searchQueries: 3-5 natural questions someone might ask to find this fact

Return JSON array only. Be concise. Extract ONLY concrete facts with specific values.

Section: WAC ${sectionId} - ${title}

Content:
${content.substring(0, 3000)}

Example output:
[
  {
    "fact": "1 hour",
    "applies_to": "formula bottles",
    "action": "throw away if not consumed",
    "context": "cannot refrigerate partial bottles",
    "searchQueries": ["how long can formula sit out", "when to throw away bottle", "bottle expiration time"]
  }
]

JSON output:`

  try {
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
    const text = data.response.trim()

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log(`  No facts found in ${sectionId}`)
      return []
    }

    const facts = JSON.parse(jsonMatch[0]) as Omit<ExtractedFact, "source" | "sourceTitle" | "sourceUrl">[]

    // Add source info to each fact
    return facts.map(f => ({
      ...f,
      source: sectionId,
      sourceTitle: title,
      sourceUrl: url,
    }))
  } catch (error) {
    console.error(`  Error processing ${sectionId}:`, error)
    return []
  }
}

async function main() {
  console.log("Loading chunks...")
  const chunksPath = join(process.cwd(), "public", "data", "chunks.json")
  const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))

  // Group chunks by section ID to get full content
  const sections = new Map<string, { title: string; content: string; url: string }>()
  for (const chunk of chunks) {
    if (!sections.has(chunk.id)) {
      sections.set(chunk.id, {
        title: chunk.sectionTitle,
        content: chunk.fullContent || chunk.content,
        url: chunk.url,
      })
    }
  }

  console.log(`Processing ${sections.size} sections with Ollama...`)

  const allFacts: ExtractedFact[] = []
  let processed = 0

  for (const [sectionId, section] of sections) {
    processed++
    console.log(`[${processed}/${sections.size}] ${sectionId} - ${section.title}`)

    const facts = await extractFactsFromSection(
      sectionId,
      section.title,
      section.content,
      section.url
    )

    if (facts.length > 0) {
      console.log(`  Extracted ${facts.length} facts`)
      allFacts.push(...facts)
    }
  }

  console.log(`\nTotal facts extracted: ${allFacts.length}`)

  // Save facts
  const outPath = join(process.cwd(), "public", "data", "facts.json")
  writeFileSync(outPath, JSON.stringify(allFacts, null, 2))
  console.log(`Saved to ${outPath}`)

  // Print sample
  console.log("\nSample facts:")
  allFacts.slice(0, 5).forEach(f => {
    console.log(`  ${f.fact} - ${f.applies_to}`)
  })
}

main().catch(console.error)
