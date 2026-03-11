import { readFileSync } from "fs"
import { join } from "path"

interface WacChunk {
  id: string
  content: string
  fullContent: string
}

interface QAPair {
  question: string
  answer: string
  sectionId: string
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function main(): void {
  const qaPath = join(process.cwd(), "public", "data", "qa-pairs.json")
  const chunksPath = join(process.cwd(), "public", "data", "chunks.json")

  const qaPairs: QAPair[] = JSON.parse(readFileSync(qaPath, "utf-8"))
  const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))

  const sectionText = new Map<string, string>()
  for (const chunk of chunks) {
    const text = `${chunk.fullContent || ""} ${chunk.content || ""}`
    sectionText.set(
      chunk.id,
      `${sectionText.get(chunk.id) || ""} ${normalize(text)}`
    )
  }

  const failures: Array<{ idx: number; sectionId: string; question: string }> = []

  for (let i = 0; i < qaPairs.length; i++) {
    const qa = qaPairs[i]
    const sec = sectionText.get(qa.sectionId)
    if (!sec) {
      failures.push({ idx: i, sectionId: qa.sectionId, question: qa.question })
      continue
    }

    const answer = normalize(qa.answer)
    if (!sec.includes(answer)) {
      failures.push({ idx: i, sectionId: qa.sectionId, question: qa.question })
    }
  }

  const passCount = qaPairs.length - failures.length
  const passPct = ((passCount / qaPairs.length) * 100).toFixed(1)

  console.log(`Grounding pass: ${passCount}/${qaPairs.length} (${passPct}%)`)
  if (failures.length > 0) {
    console.log("Failures (first 20):")
    for (const f of failures.slice(0, 20)) {
      console.log(`- [${f.idx}] ${f.sectionId}: ${f.question}`)
    }
    process.exit(1)
  }

  console.log("All QA pairs are grounded in their cited section text.")
}

main()
