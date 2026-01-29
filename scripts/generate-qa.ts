import Anthropic from "@anthropic-ai/sdk"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const client = new Anthropic()

interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  subsectionPath: string
  content: string
  fullContent: string
  url: string
  category: string
}

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
  category: string
}

// Group chunks by section ID and combine their content
function groupChunksBySection(chunks: WacChunk[]): Map<string, { title: string; content: string; url: string; category: string }> {
  const sections = new Map<string, { title: string; content: string; url: string; category: string }>()

  for (const chunk of chunks) {
    if (!sections.has(chunk.id)) {
      sections.set(chunk.id, {
        title: chunk.sectionTitle,
        content: chunk.fullContent || chunk.content,
        url: chunk.url,
        category: chunk.category,
      })
    }
  }

  return sections
}

async function generateQAForSection(
  sectionId: string,
  title: string,
  content: string,
  category: string
): Promise<{ question: string; answer: string }[]> {
  const prompt = `You are helping create a Q&A database for Washington State childcare regulations (WAC 110-300).

Given this regulation section, generate 3-8 natural questions that a parent or childcare provider might ask, along with clear, concise answers.

IMPORTANT GUIDELINES:
- Questions should be in natural, conversational language (how parents actually talk)
- Include common variations and phrasings people might use
- Answers should be plain English, not legalese
- Include specific numbers, times, or requirements from the text
- Focus on the most practically useful information
- If the section has time limits, ratios, temperatures, or specific requirements, make sure to cover those

Section: WAC ${sectionId} - ${title}
Category: ${category}

Content:
${content.substring(0, 3000)}

Respond with a JSON array of objects with "question" and "answer" fields. Only output the JSON array, nothing else.

Example format:
[
  {"question": "How long can formula sit out before I need to throw it away?", "answer": "Formula must be thrown away within 1 hour if not fully consumed. You cannot put a partially consumed bottle back in the refrigerator."},
  {"question": "What temperature should the daycare refrigerator be?", "answer": "The refrigerator must be kept at 40°F (4°C) or below."}
]`

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error(`  No JSON found for ${sectionId}`)
      return []
    }

    const pairs = JSON.parse(jsonMatch[0]) as { question: string; answer: string }[]
    return pairs
  } catch (error) {
    console.error(`  Error processing ${sectionId}:`, error)
    return []
  }
}

async function main() {
  console.log("Loading chunks...")
  const chunksPath = join(process.cwd(), "public", "data", "chunks.json")
  const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))

  console.log("Grouping by section...")
  const sections = groupChunksBySection(chunks)
  console.log(`Found ${sections.size} unique sections`)

  const allQAPairs: QAPair[] = []
  let processed = 0

  for (const [sectionId, section] of sections) {
    processed++
    console.log(`[${processed}/${sections.size}] Processing ${sectionId} - ${section.title}`)

    const pairs = await generateQAForSection(sectionId, section.title, section.content, section.category)

    for (const pair of pairs) {
      allQAPairs.push({
        question: pair.question,
        answer: pair.answer,
        sectionId,
        sectionTitle: section.title,
        url: section.url,
        category: section.category,
      })
    }

    console.log(`  Generated ${pairs.length} Q&A pairs`)

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  console.log(`\nTotal Q&A pairs generated: ${allQAPairs.length}`)

  // Save Q&A pairs
  const outPath = join(process.cwd(), "public", "data", "qa-pairs.json")
  writeFileSync(outPath, JSON.stringify(allQAPairs, null, 2))
  console.log(`Saved to ${outPath}`)

  // Print some stats
  const byCategory = allQAPairs.reduce((acc, qa) => {
    acc[qa.category] = (acc[qa.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log("\nQ&A pairs by category:", byCategory)
}

main().catch(console.error)
