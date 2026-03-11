import fs from "node:fs/promises"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { env, pipeline } from "@huggingface/transformers"
import intentAliases from "../src/lib/intent-aliases.json"

type Manifest = {
  version: string
  ready: boolean
  modelPath: string
  labels: string[]
  temperature: number
  thresholds?: {
    minConfidence?: number
    minMargin?: number
  }
}

type AnswerBankRecord = {
  qaId: string
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

type QueryBankRecord = {
  qaId: string
  sectionId: string
  queries: string[]
}

type DatasetRow = {
  text: string
  label: string
  kind?: string
  style?: string
}

type ClassifierOutput = {
  label: string
  score: number
}

type InferenceTrace = {
  text: string
  normalizedQuery: string
  trueQaId: string
  trueSectionId: string
  predictedSectionId: string
  predictedQaId: string | null
  top1: number
  margin: number
  matched: boolean
  reason: "matched" | "ood" | "low_confidence" | "low_margin" | "no_candidates"
  topSections: Array<{ label: string; confidence: number }>
  topCandidates: Array<{ qaId: string; sectionId: string; question: string; score: number }>
}

const CANONICAL_QA_BY_ID = intentAliases.canonicalByQaId as Record<string, string>

class BM25Index {
  private k1 = 1.5
  private b = 0.75
  private avgDocLength = 0
  private docLengths: number[] = []
  private termFreqs = new Map<string, number[]>()
  private docFreqs = new Map<string, number>()
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
    this.docLengths = []
    this.termFreqs.clear()
    this.docFreqs.clear()

    for (let i = 0; i < documents.length; i += 1) {
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
      this.docLengths.reduce((sum, length) => sum + length, 0) / Math.max(1, this.numDocs)
  }

  search(query: string): number[] {
    const queryTokens = this.tokenize(query)
    const scores = new Array(this.numDocs).fill(0)

    for (const term of queryTokens) {
      const docFreq = this.docFreqs.get(term) || 0
      if (docFreq === 0) continue

      const idf = Math.log((this.numDocs - docFreq + 0.5) / (docFreq + 0.5) + 1)
      const termFreqArray = this.termFreqs.get(term)!

      for (let i = 0; i < this.numDocs; i += 1) {
        const tf = termFreqArray[i]
        if (tf === 0) continue

        const docLength = this.docLengths[i]
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)))
        scores[i] += idf * tfNorm
      }
    }

    return scores
  }
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function softmax(values: number[], temperature: number): number[] {
  const safeTemperature = temperature <= 0 ? 1 : temperature
  const scaled = values.map((v) => v / safeTemperature)
  const max = Math.max(...scaled)
  const exp = scaled.map((v) => Math.exp(v - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  return exp.map((v) => v / sum)
}

function parseLabel(label: string, manifest: Manifest): string {
  if (manifest.labels.includes(label)) {
    return label
  }

  const match = label.match(/(\d+)$/)
  if (!match) return label

  const idx = Number.parseInt(match[1], 10)
  return manifest.labels[idx] || label
}

function canonicalizeQaId(qaId: string): string {
  return CANONICAL_QA_BY_ID[qaId] || qaId
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyOf(item)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

function formatSectionCounts(
  rows: Array<{ key: string; count: number }>,
  sectionTitleById: Map<string, string>
) {
  return rows.map(({ key, count }) => ({
    sectionId: key,
    sectionTitle: sectionTitleById.get(key) || "",
    count,
  }))
}

function formatSectionTransitions(
  rows: Array<{ key: string; count: number }>,
  sectionTitleById: Map<string, string>
) {
  return rows.map(({ key, count }) => {
    const [trueSectionId, predictedSectionId] = key.split(" -> ")
    return {
      trueSectionId,
      trueSectionTitle: sectionTitleById.get(trueSectionId) || "",
      predictedSectionId,
      predictedSectionTitle: sectionTitleById.get(predictedSectionId) || "",
      count,
    }
  })
}

function formatQaConfusions(
  rows: Array<{ key: string; count: number }>,
  qaById: Map<string, AnswerBankRecord>
) {
  return rows.map(({ key, count }) => {
    const [trueQaId, predictedQaId] = key.split(" -> ")
    const trueQa = qaById.get(trueQaId)
    const predictedQa = qaById.get(predictedQaId)
    return {
      trueQaId,
      trueQuestion: trueQa?.question || "",
      trueSectionId: trueQa?.sectionId || "",
      predictedQaId,
      predictedQuestion: predictedQa?.question || "",
      predictedSectionId: predictedQa?.sectionId || "",
      count,
    }
  })
}

function shouldOverrideLowMarginAbstain(
  confidence: number,
  topCandidates: Array<{ qaId: string; sectionId: string; question: string; score: number }>
) {
  if (confidence < 0.22 || topCandidates.length === 0) {
    return false
  }

  const topScore = topCandidates[0]?.score ?? 0
  const secondScore = topCandidates[1]?.score ?? 0
  const gap = topScore - secondScore
  const ratio = secondScore > 0 ? topScore / secondScore : Number.POSITIVE_INFINITY

  if (topCandidates.length === 1) {
    return topScore >= 2.5
  }

  if (topScore >= 7 && gap >= 3) {
    return true
  }

  if (topScore >= 5 && ratio >= 2.5) {
    return true
  }

  return topScore >= 4 && gap >= 4
}

function inferHintedSections(normalizedQuery: string): string[] {
  const hints: string[] = []
  const push = (sectionId: string) => {
    if (!hints.includes(sectionId)) {
      hints.push(sectionId)
    }
  }

  if (/\bmixed age\b/.test(normalizedQuery)) {
    push("110-300-0357")
  }

  if (/\b(unvaccinated|vaccin|immuniz|shot record|shots required|exempt)\b/.test(normalizedQuery)) {
    push("110-300-0210")
  }

  if (/\b(breast milk|expressed milk|pumped milk)\b/.test(normalizedQuery)) {
    push("110-300-0281")
  }

  if (
    /\b(formula|bottle|sanitize bottle|half finished bottle|warm bottle|microwave bottle|shared bottle|discard formula|throw away formula)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0280")
  }

  if (
    /\b(play outside every day|go outside every day|outside every day|daily outdoor|outdoor time required|outside each day)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0360")
  }

  if (
    /\b(outdoor space|outdoor play space|play area|square feet outside|required per child outside)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0145")
  }

  if (
    /\b(notify parents|tell me|tell parents|report to parents|contact the parent|serious injury|injury|hurt at daycare|accident|incident)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0475")
  }

  if (
    /\b(outbreak|fever|vomit|throwing up|throw up|sick child|lice|return to daycare|send home|rectally)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0205")
  }

  if (/\b(wash hands|hand sanitizer)\b/.test(normalizedQuery)) {
    push("110-300-0200")
  }

  if (
    /\b(indoor temperature|room temperature|inside daycare|inside child care|temperature inside|temperature indoors|water temperature)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0165")
  }

  if (/\b(medication|medicine|melatonin|sunscreen|prescription)\b/.test(normalizedQuery)) {
    push("110-300-0215")
  }

  if (
    /\b(family home|family child care|home daycare|family daycare|family provider|provider working alone|working alone)\b/.test(
      normalizedQuery
    ) &&
    /\b(ratio|capacity|group size|school age|infant|children|kids|staff|care for)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0355")
  }

  if (
    /\b(center|classroom|teacher|staff member)\b/.test(normalizedQuery) &&
    /\b(ratio|capacity|group size|school age|toddler|infant|preschool|kids)\b/.test(normalizedQuery)
  ) {
    push("110-300-0356")
  }

  if (/\b(how often do staff need training|training frequency|in service training)\b/.test(normalizedQuery)) {
    push("110-300-0107")
  }

  return hints
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T
}

async function loadJsonl(filePath: string): Promise<DatasetRow[]> {
  const raw = await fs.readFile(filePath, "utf8")
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DatasetRow)
}

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith("--")) continue
    parsed[token.slice(2)] = argv[i + 1]
    i += 1
  }
  return parsed
}

function summarizeSplit(rows: InferenceTrace[]) {
  const inScope = rows.filter((row) => row.trueQaId !== "NOT_COVERED")
  const matched = inScope.filter((row) => row.matched)
  const correct = matched.filter(
    (row) => canonicalizeQaId(row.predictedQaId || "") === canonicalizeQaId(row.trueQaId)
  )
  const abstains = inScope.filter((row) => !row.matched)
  const ood = rows.filter((row) => row.trueQaId === "NOT_COVERED")
  const oodFalseAccepts = ood.filter((row) => row.matched)
  const sectionRoutingMisses = matched.filter(
    (row) => row.predictedSectionId !== "NOT_COVERED" && row.predictedSectionId !== row.trueSectionId
  )
  const wrongMatches = matched.filter(
    (row) => canonicalizeQaId(row.predictedQaId || "") !== canonicalizeQaId(row.trueQaId)
  )

  return {
    total: rows.length,
    matchedTotal: matched.length,
    exactQaPrecision: matched.length ? correct.length / matched.length : 0,
    inScopeTotal: inScope.length,
    inScopeAbstainRate: inScope.length ? abstains.length / inScope.length : 0,
    oodTotal: ood.length,
    oodFalseAcceptRate: ood.length ? oodFalseAccepts.length / ood.length : 0,
    sectionRoutingMissRate: matched.length ? sectionRoutingMisses.length / matched.length : 0,
    wrongMatchRate: matched.length ? wrongMatches.length / matched.length : 0,
  }
}

async function main() {
  const projectRoot = "/Users/erik/Developer/projects/wac-search"
  const args = parseArgs(process.argv.slice(2))
  const modelDir = args["model-dir"] || path.join(projectRoot, "public/models/intent-v1")
  const answerBankPath =
    args["answer-bank"] || path.join(projectRoot, "public/data/intent-answer-bank.v1.json")
  const queryBankPath =
    args["query-bank"] || path.join(projectRoot, "public/data/intent-query-bank.v1.json")
  const testPath = args["test-file"] || path.join(projectRoot, "ml/data/test.jsonl")
  const challengePath = args["challenge-file"] || path.join(projectRoot, "ml/data/challenge.jsonl")
  const outPath =
    args["out-file"] || path.join(projectRoot, "ml/artifacts/intent-runtime-evaluation.json")

  const manifest = await loadJson<Manifest>(path.join(modelDir, "manifest.json"))
  const answerBank = await loadJson<AnswerBankRecord[]>(answerBankPath)
  const queryBank = await loadJson<QueryBankRecord[]>(queryBankPath)
  const testRows = await loadJsonl(testPath)
  const challengeRows = await loadJsonl(challengePath)

  const qaById = new Map(answerBank.map((record) => [record.qaId, record]))
  const qaToSection = new Map(
    answerBank.map((record) => {
      const canonical = qaById.get(canonicalizeQaId(record.qaId)) || record
      return [record.qaId, canonical.sectionId]
    })
  )
  const sectionTitleById = new Map(answerBank.map((record) => [record.sectionId, record.sectionTitle]))
  const queriesByQaId = new Map(queryBank.map((record) => [record.qaId, record.queries]))
  const bySection = new Map<
    string,
    Map<string, { record: AnswerBankRecord; queries: Set<string> }>
  >()
  for (const record of answerBank) {
    const canonicalQaId = canonicalizeQaId(record.qaId)
    const canonicalRecord = qaById.get(canonicalQaId) || record
    const sectionId = canonicalRecord.sectionId
    const grouped = bySection.get(sectionId) || new Map()
    const existing = grouped.get(canonicalQaId) || {
      record: canonicalRecord,
      queries: new Set<string>(),
    }
    existing.queries.add(record.question)
    for (const query of queriesByQaId.get(record.qaId) || []) {
      existing.queries.add(query)
    }
    for (const query of queriesByQaId.get(canonicalQaId) || []) {
      existing.queries.add(query)
    }
    grouped.set(canonicalQaId, existing)
    bySection.set(sectionId, grouped)
  }

  const sectionIndexes = new Map<
    string,
    { index: BM25Index; records: Array<{ record: AnswerBankRecord; queries: string[] }> }
  >()
  for (const [sectionId, grouped] of bySection) {
    const records = Array.from(grouped.values()).map((entry) => ({
      record: entry.record,
      queries: Array.from(entry.queries),
    }))
    const docs = records.map((entry) =>
      [entry.record.question, entry.record.answer, entry.record.sectionTitle, ...entry.queries].join(" ")
    )
    const index = new BM25Index()
    index.index(docs)
    sectionIndexes.set(sectionId, { index, records })
  }

  function getTopCandidatesForSection(sectionId: string, normalizedQuery: string, topK = 5) {
    const section = sectionIndexes.get(sectionId)
    if (!section) {
      return []
    }

    const scores = section.index.search(normalizedQuery)
    return section.records
      .map((entry, index) => ({
        qaId: entry.record.qaId,
        sectionId: entry.record.sectionId,
        question: entry.record.question,
        score: scores[index] || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  function maybeApplyHintedSectionOverride(
    normalizedQuery: string,
    predictedSectionId: string,
    topCandidates: Array<{ qaId: string; sectionId: string; question: string; score: number }>,
    matched: boolean
  ) {
    if (predictedSectionId === "NOT_COVERED") {
      return { predictedSectionId, topCandidates, overridden: false }
    }

    const hintedSections = inferHintedSections(normalizedQuery).filter(
      (sectionId) => sectionId !== predictedSectionId
    )
    if (hintedSections.length === 0) {
      return { predictedSectionId, topCandidates, overridden: false }
    }

    const currentTopScore = topCandidates[0]?.score ?? 0
    let bestSectionId = predictedSectionId
    let bestCandidates = topCandidates
    let bestScore = currentTopScore

    for (const hintedSectionId of hintedSections) {
      const hintedCandidates = getTopCandidatesForSection(hintedSectionId, normalizedQuery)
      const hintedScore = hintedCandidates[0]?.score ?? 0
      if (hintedScore > bestScore) {
        bestScore = hintedScore
        bestSectionId = hintedSectionId
        bestCandidates = hintedCandidates
      }
    }

    if (bestSectionId === predictedSectionId || bestCandidates.length === 0) {
      return { predictedSectionId, topCandidates, overridden: false }
    }

    const delta = bestScore - currentTopScore
    if (!matched) {
      if (bestScore >= 3.2 && delta >= 0.6) {
        return { predictedSectionId: bestSectionId, topCandidates: bestCandidates, overridden: true }
      }
      return { predictedSectionId, topCandidates, overridden: false }
    }

    if (bestScore >= 4.5 && delta >= 1.2) {
      return { predictedSectionId: bestSectionId, topCandidates: bestCandidates, overridden: true }
    }

    return { predictedSectionId, topCandidates, overridden: false }
  }

  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.useFS = true
  env.localModelPath = path.join(projectRoot, "public/models/")

  const loadStart = performance.now()
  const classifier = await pipeline("text-classification", "intent-v1", {
    local_files_only: true,
    dtype: "fp32",
    device: "cpu",
    subfolder: "",
    model_file_name: "model",
  })
  const coldLoadMs = performance.now() - loadStart

  const inferenceCache = new Map<string, InferenceTrace>()

  async function infer(text: string, trueQaId: string): Promise<InferenceTrace> {
    const cacheKey = `${trueQaId}::${text}`
    const cached = inferenceCache.get(cacheKey)
    if (cached) return cached

    const normalizedQuery = normalizeQuery(text)
    const raw = (await classifier(normalizedQuery, { top_k: 5 })) as unknown
    const flat: ClassifierOutput[] = []
    const rawArray = Array.isArray(raw) ? raw : [raw]
    for (const item of rawArray) {
      if (Array.isArray(item)) {
        flat.push(...(item as ClassifierOutput[]))
      } else {
        flat.push(item as ClassifierOutput)
      }
    }

    const parsed = flat
      .map((item) => ({
        label: parseLabel(item.label, manifest),
        score: item.score,
      }))
      .sort((a, b) => b.score - a.score)

    const probabilities = softmax(
      parsed.map((item) => item.score),
      manifest.temperature || 1.0
    )
    const top1 = probabilities[0] ?? 0
    const top2 = probabilities[1] ?? 0
    const margin = top1 - top2
    let predictedSectionId = parsed[0]?.label || "NOT_COVERED"
    const topSections = parsed.slice(0, 5).map((item, index) => ({
      label: item.label,
      confidence: probabilities[index] ?? 0,
    }))

    let predictedQaId: string | null = null
    let topCandidates: Array<{ qaId: string; sectionId: string; question: string; score: number }> = []

    const section = sectionIndexes.get(predictedSectionId)
    if (section) {
      topCandidates = getTopCandidatesForSection(predictedSectionId, normalizedQuery)
      predictedQaId = topCandidates[0]?.qaId || null
    }

    const minConfidence = manifest.thresholds?.minConfidence ?? 0.1
    const minMargin = manifest.thresholds?.minMargin ?? 0.05
    let matched = false
    let reason: InferenceTrace["reason"] = "matched"
    if (predictedSectionId === "NOT_COVERED") {
      reason = "ood"
    } else if (top1 < minConfidence) {
      reason = "low_confidence"
    } else if (margin < minMargin) {
      reason = "low_margin"
    } else if (!predictedQaId) {
      reason = "no_candidates"
    } else {
      matched = true
    }

    const hinted = maybeApplyHintedSectionOverride(
      normalizedQuery,
      predictedSectionId,
      topCandidates,
      matched
    )
    if (hinted.overridden) {
      predictedSectionId = hinted.predictedSectionId
      topCandidates = hinted.topCandidates
      predictedQaId = topCandidates[0]?.qaId || null
      matched = true
      reason = "matched"
    }

    if (
      !matched &&
      reason === "low_margin" &&
      predictedQaId &&
      shouldOverrideLowMarginAbstain(top1, topCandidates)
    ) {
      matched = true
      reason = "matched"
    }

    const trace: InferenceTrace = {
      text,
      normalizedQuery,
      trueQaId,
      trueSectionId: qaToSection.get(trueQaId) || (trueQaId === "NOT_COVERED" ? "NOT_COVERED" : "UNKNOWN"),
      predictedSectionId,
      predictedQaId,
      top1,
      margin,
      matched,
      reason,
      topSections,
      topCandidates,
    }
    inferenceCache.set(cacheKey, trace)
    return trace
  }

  async function evaluateSplit(rows: DatasetRow[]) {
    const traces: InferenceTrace[] = []
    const timings: number[] = []
    for (const row of rows) {
      const start = performance.now()
      const trace = await infer(row.text, row.label)
      traces.push(trace)
      timings.push(performance.now() - start)
    }

    const sortedTimings = [...timings].sort((a, b) => a - b)
    const p95Index = Math.min(sortedTimings.length - 1, Math.floor(sortedTimings.length * 0.95))
    const wrongMatches = traces.filter(
      (row) => row.matched && canonicalizeQaId(row.predictedQaId || "") !== canonicalizeQaId(row.trueQaId)
    )
    const abstains = traces.filter((row) => row.trueQaId !== "NOT_COVERED" && !row.matched)
    const sectionMisses = traces.filter(
      (row) =>
        row.matched &&
        row.predictedSectionId !== "NOT_COVERED" &&
        row.trueQaId !== "NOT_COVERED" &&
        row.predictedSectionId !== row.trueSectionId
    )

    return {
      summary: summarizeSplit(traces),
      latency: {
        avgMs: timings.reduce((sum, value) => sum + value, 0) / Math.max(1, timings.length),
        p95Ms: sortedTimings[p95Index] || 0,
      },
      buckets: {
        abstainByTrueSection: formatSectionCounts(
          countBy(abstains, (row) => row.trueSectionId).slice(0, 15),
          sectionTitleById
        ),
        wrongMatchByTrueSection: formatSectionCounts(
          countBy(wrongMatches, (row) => row.trueSectionId).slice(0, 15),
          sectionTitleById
        ),
        wrongMatchByPredictedSection: formatSectionCounts(
          countBy(wrongMatches, (row) => row.predictedSectionId).slice(0, 15),
          sectionTitleById
        ),
        sectionRoutingMisses: formatSectionTransitions(
          countBy(sectionMisses, (row) => `${row.trueSectionId} -> ${row.predictedSectionId}`).slice(0, 20),
          sectionTitleById
        ),
        confusionPairs: formatQaConfusions(
          countBy(
            wrongMatches.filter((row) => row.predictedQaId),
            (row) => `${row.trueQaId} -> ${row.predictedQaId}`
          ).slice(0, 20),
          qaById
        ),
        abstainReasons: countBy(abstains, (row) => row.reason).slice(0, 10),
      },
      samples: {
        abstains: abstains.slice(0, 20),
        wrongMatches: wrongMatches.slice(0, 20),
      },
    }
  }

  const warmQueries = [
    "how soon can a child return after throwing up",
    "what paperwork do you need for child injuries",
    "what are the sleep rules for infants",
    "what are staff training requirements",
    "do kids need immunization records",
  ]
  const warmTimings: number[] = []
  for (const query of warmQueries) {
    const start = performance.now()
    await infer(query, "NOT_COVERED")
    warmTimings.push(performance.now() - start)
  }
  const warmSorted = [...warmTimings].sort((a, b) => a - b)

  const report = {
    generatedAt: new Date().toISOString(),
    model: {
      path: modelDir,
      sizeBytes: (await fs.stat(path.join(modelDir, "model.onnx"))).size,
      labelCount: manifest.labels.length,
      temperature: manifest.temperature,
      thresholds: manifest.thresholds,
    },
    latency: {
      coldLoadMs,
      warmAvgMs: warmTimings.reduce((sum, value) => sum + value, 0) / Math.max(1, warmTimings.length),
      warmP95Ms: warmSorted[Math.min(warmSorted.length - 1, Math.floor(warmSorted.length * 0.95))] || 0,
      warmSamplesMs: warmTimings,
    },
    test: await evaluateSplit(testRows),
    challenge: await evaluateSplit(challengeRows),
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

void main()
