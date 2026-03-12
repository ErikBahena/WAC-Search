import { createHash } from "crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { toDisplayAnswer } from "../src/lib/answer-display"

interface QAPair {
  qaId?: string
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

interface AnswerBankRecord {
  qaId: string
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

interface TopicSuggestion {
  label: string
  query: string
}

interface QueryBankRecord {
  qaId: string
  sectionId: string
  queries: string[]
}

interface IntentManifest {
  version: string
  ready: boolean
  modelPath: string
  labels: string[]
  temperature: number
  thresholds: {
    minConfidence: number
    minMargin: number
  }
}

interface IntentAliases {
  canonicalByQaId?: Record<string, string>
}

function readExistingManifest(path: string): IntentManifest | null {
  if (!existsSync(path)) return null

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as IntentManifest
  } catch {
    return null
  }
}

function readIntentAliases(path: string): Record<string, string> {
  if (!existsSync(path)) return {}

  try {
    const payload = JSON.parse(readFileSync(path, "utf-8")) as IntentAliases
    return payload.canonicalByQaId || {}
  } catch {
    return {}
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function buildQaId(question: string, sectionId: string): string {
  return createHash("sha1")
    .update(`${sectionId}::${question}`)
    .digest("hex")
    .slice(0, 12)
}

function buildAnswerBank(qaPairs: QAPair[]): AnswerBankRecord[] {
  const usedIds = new Set<string>()
  return qaPairs.map((qa) => {
    const baseId = qa.qaId || buildQaId(qa.question, qa.sectionId)
    let qaId = baseId
    let suffix = 2
    while (usedIds.has(qaId)) {
      qaId = `${baseId}-${suffix}`
      suffix++
    }
    usedIds.add(qaId)

    return {
      qaId,
      question: normalizeText(qa.question),
      answer: toDisplayAnswer(normalizeText(qa.question), normalizeText(qa.answer)),
      sectionId: qa.sectionId,
      sectionTitle: normalizeText(qa.sectionTitle),
      url: qa.url,
    }
  })
}

function buildTopicSuggestions(answerBank: AnswerBankRecord[]): TopicSuggestion[] {
  const bySection = new Map<string, { title: string; count: number; sampleQuery: string }>()
  for (const qa of answerBank) {
    const key = qa.sectionId
    const current = bySection.get(key)
    if (current) {
      current.count += 1
    } else {
      bySection.set(key, {
        title: qa.sectionTitle,
        count: 1,
        sampleQuery: qa.question,
      })
    }
  }

  return Array.from(bySection.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((entry) => ({
      label: entry.title,
      query: entry.sampleQuery,
    }))
}

function resolveQaId(
  qaId: string,
  answerBankById: Map<string, AnswerBankRecord>,
  aliases: Record<string, string>
): string | null {
  if (answerBankById.has(qaId)) return qaId

  const canonicalQaId = aliases[qaId]
  if (!canonicalQaId) return null

  return answerBankById.has(canonicalQaId) ? canonicalQaId : null
}

function addManualQuery(
  manualByQaId: Map<string, string[]>,
  qaId: string,
  text: string
): void {
  const normalized = normalizeText(text)
  if (!normalized) return

  const list = manualByQaId.get(qaId) || []
  if (!list.includes(normalized)) {
    list.push(normalized)
    manualByQaId.set(qaId, list)
  }
}

function loadManualJsonlQueries(
  manualByQaId: Map<string, string[]>,
  answerBankById: Map<string, AnswerBankRecord>,
  aliases: Record<string, string>
): void {
  const manualPath = join(process.cwd(), "ml", "data", "in_scope.jsonl")
  if (!existsSync(manualPath)) return

  const lines = readFileSync(manualPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const row = JSON.parse(line) as { label?: string; text?: string }
    const rawQaId = row.label?.trim()
    if (!rawQaId || !row.text) continue

    const qaId = resolveQaId(rawQaId, answerBankById, aliases)
    if (!qaId) continue

    addManualQuery(manualByQaId, qaId, row.text)
  }
}

function loadManualTsvQueries(
  manualByQaId: Map<string, string[]>,
  answerBankById: Map<string, AnswerBankRecord>,
  aliases: Record<string, string>
): void {
  const manualDir = join(process.cwd(), "ml", "manual")
  if (!existsSync(manualDir)) return

  const files = readdirSync(manualDir)
    .filter((file) => file.startsWith("in_scope") && file.endsWith(".tsv"))
    .sort()

  for (const file of files) {
    const lines = readFileSync(join(manualDir, file), "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      if (line.startsWith("#")) continue

      const parts = line.split("\t").map((part) => part.trim()).filter(Boolean)
      const rawQaId = parts[0]
      if (!rawQaId) continue

      const qaId = resolveQaId(rawQaId, answerBankById, aliases)
      if (!qaId) continue

      for (const text of parts.slice(1)) {
        addManualQuery(manualByQaId, qaId, text)
      }
    }
  }
}

function buildQueryBank(answerBank: AnswerBankRecord[]): QueryBankRecord[] {
  const answerBankById = new Map(answerBank.map((record) => [record.qaId, record]))
  const aliases = readIntentAliases(join(process.cwd(), "src", "lib", "intent-aliases.json"))
  const manualByQaId = new Map<string, string[]>()

  loadManualJsonlQueries(manualByQaId, answerBankById, aliases)
  loadManualTsvQueries(manualByQaId, answerBankById, aliases)

  return answerBank.map((record) => {
    const queries = manualByQaId.get(record.qaId) || [normalizeText(record.question)]
    return {
      qaId: record.qaId,
      sectionId: record.sectionId,
      queries,
    }
  })
}

function buildManifest(
  answerBank: AnswerBankRecord[],
  existingManifest: IntentManifest | null,
  hasExportedModel: boolean
): IntentManifest {
  const fallbackLabels = [...answerBank.map((row) => row.qaId), "NOT_COVERED"]
  return {
    version: "v1",
    ready: existingManifest?.ready ?? hasExportedModel,
    modelPath: existingManifest?.modelPath || "/models/intent-v1",
    // Preserve exported model labels. The shipped ONNX is a section classifier,
    // so rewriting labels from the answer bank would corrupt runtime routing.
    labels: existingManifest?.labels?.length ? existingManifest.labels : fallbackLabels,
    temperature: existingManifest?.temperature ?? 1.0,
    thresholds: {
      minConfidence: existingManifest?.thresholds?.minConfidence ?? 0.1,
      minMargin: existingManifest?.thresholds?.minMargin ?? 0.15,
    },
  }
}

function main(): void {
  const dataDir = join(process.cwd(), "public", "data")
  const modelDir = join(process.cwd(), "public", "models", "intent-v1")
  const qaPath = join(dataDir, "qa-pairs.json")
  const manifestPath = join(modelDir, "manifest.json")
  const modelPath = join(modelDir, "model.onnx")

  const qaPairs: QAPair[] = JSON.parse(readFileSync(qaPath, "utf-8"))
  const answerBank = buildAnswerBank(qaPairs)
  const topicSuggestions = buildTopicSuggestions(answerBank)
  const queryBank = buildQueryBank(answerBank)
  const existingManifest = readExistingManifest(manifestPath)
  const manifest = buildManifest(answerBank, existingManifest, existsSync(modelPath))

  mkdirSync(modelDir, { recursive: true })

  writeFileSync(
    join(dataDir, "intent-answer-bank.v1.json"),
    JSON.stringify(answerBank, null, 2)
  )
  writeFileSync(
    join(dataDir, "topic-suggestions.v1.json"),
    JSON.stringify(topicSuggestions, null, 2)
  )
  writeFileSync(
    join(dataDir, "intent-query-bank.v1.json"),
    JSON.stringify(queryBank, null, 2)
  )
  writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2)
  )

  console.log(`Built intent assets: ${answerBank.length} answers, ${topicSuggestions.length} topic suggestions`)
  console.log(`Manifest written to ${join(modelDir, "manifest.json")}`)
}

main()
