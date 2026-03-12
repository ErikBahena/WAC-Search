import { env, pipeline, type TextClassificationPipeline } from "@huggingface/transformers"
import intentAliases from "./intent-aliases.json"
import type {
  AnswerBankRecord,
  ClarificationOption,
  IntentResult,
  QueryBankRecord,
  SearchClarification,
  SearchDebugCandidate,
  SearchResponse,
  SearchResult,
  TopicSuggestion,
  WacChunk,
} from "./intent-types"

interface IntentManifest {
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

interface ClassifierOutput {
  label: string
  score: number
}

const DEFAULT_MATCH_THRESHOLD = 0.1
const DEFAULT_MARGIN_THRESHOLD = 0.15
const NOT_COVERED = "NOT_COVERED"
const CANONICAL_QA_BY_ID = intentAliases.canonicalByQaId as Record<string, string>
const EXPLICIT_CENTER_PATTERN =
  /\b(center|child care center|childcare center|daycare center|center daycare|center child care|center childcare)\b/
const EXPLICIT_FAMILY_HOME_PATTERN =
  /\b(family home|family child care|family childcare|home daycare|home child care|home childcare|in home daycare|in-home daycare)\b/

let classifier: TextClassificationPipeline | null = null
let manifest: IntentManifest | null = null
let answerBank: AnswerBankRecord[] = []
let topicSuggestions: TopicSuggestion[] = []
let queryBank: QueryBankRecord[] = []
let exactQueryQaIds = new Map<string, string>()
let sectionIndexes = new Map<
  string,
  {
    index: BM25Index
    records: Array<{ record: AnswerBankRecord; queries: string[] }>
  }
>()
let isInitialized = false
let initPromise: Promise<void> | null = null

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

    for (let i = 0; i < documents.length; i++) {
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

      for (let i = 0; i < this.numDocs; i++) {
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

function configureTransformersEnv(): void {
  // In browser, transformers.js defaults to disallowing local models.
  // We host model files under /public/models, so point local model root there.
  env.allowLocalModels = true
  env.allowRemoteModels = false
  env.localModelPath = resolveAssetUrl("models/")
  // Avoid stale model bytes in transformers' custom cache (seen during rapid local iteration).
  env.useBrowserCache = false
}

function resolveAssetUrl(path: string): string {
  if (typeof window === "undefined") return path
  const baseUrl = import.meta.env.BASE_URL || "/"
  const normalizedPath = path.replace(/^\/+/, "")
  return new URL(normalizedPath, new URL(baseUrl, window.location.origin)).toString()
}

function resolveModelId(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "")
  if (!trimmed) return "intent-v1"

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed)
    const segments = parsed.pathname.split("/").filter(Boolean)
    return segments[segments.length - 1] || "intent-v1"
  }

  if (trimmed.startsWith("/")) {
    const segments = trimmed.split("/").filter(Boolean)
    return segments[segments.length - 1] || "intent-v1"
  }

  return trimmed
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function toClarificationOption(
  id: string,
  label: string,
  query: string,
  description?: string
): ClarificationOption {
  return { id, label, query, description }
}

function hasAnyPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value))
}

function isRatioClarificationQuery(normalizedQuery: string): boolean {
  if (EXPLICIT_CENTER_PATTERN.test(normalizedQuery) || EXPLICIT_FAMILY_HOME_PATTERN.test(normalizedQuery)) {
    return false
  }

  return hasAnyPattern(normalizedQuery, [
    /\bratio\b/,
    /\bratios\b/,
    /\bstaff to child\b/,
    /\bchild to staff\b/,
    /\bchildren per staff\b/,
    /\bkids per staff\b/,
    /\bstaffing requirements?\b/,
    /\bgroup size\b/,
    /\bcapacity\b/,
    /\bhow many (children|kids|infants|toddlers|preschoolers|school age)\b/,
  ])
}

function isOutdoorClarificationQuery(normalizedQuery: string): boolean {
  if (!/\b(outdoor|outside|playground)\b/.test(normalizedQuery)) {
    return false
  }

  if (/\b(fence|gate|barrier|support|climb|running|equipment|surface|hazard)\b/.test(normalizedQuery)) {
    return false
  }

  const explicitTime = hasAnyPattern(normalizedQuery, [
    /\bminutes?\b/,
    /\bhours?\b/,
    /\bplay time\b/,
    /\boutdoor time\b/,
    /\bdaily outdoor play\b/,
    /\boutside every day\b/,
    /\bgo outside every day\b/,
    /\boutdoor play each day\b/,
    /\bper day\b/,
  ])
  const explicitSpace = hasAnyPattern(normalizedQuery, [
    /\bspace\b/,
    /\bsquare feet\b/,
    /\bsquare footage\b/,
    /\bsq ft\b/,
    /\busable space\b/,
    /\bper child\b/,
  ])

  if (explicitTime || explicitSpace) {
    return false
  }

  return hasAnyPattern(normalizedQuery, [
    /\bhow much\b/,
    /\bwhat (are|is) the\b/,
    /\brequired\b/,
    /\brequirements?\b/,
    /\bneed(?:ed)?\b/,
    /\bmust\b/,
    /\bhave to\b/,
    /\bplay\b/,
  ])
}

function isMilkClarificationQuery(normalizedQuery: string): boolean {
  if (!/\bmilk\b/.test(normalizedQuery)) {
    return false
  }

  if (/\b(breast|expressed|formula|bottle)\b/.test(normalizedQuery)) {
    return false
  }

  return hasAnyPattern(normalizedQuery, [
    /\bstore\b/,
    /\bstorage\b/,
    /\bsit out\b/,
    /\bsitting out\b/,
    /\bwarm\b/,
    /\bwarming\b/,
    /\blabel\b/,
    /\bhandle\b/,
    /\brules?\b/,
    /\brefrigerat(?:e|ion)\b/,
    /\bfridge\b/,
    /\bdiscard\b/,
    /\bthrow away\b/,
  ])
}

function detectClarification(normalizedQuery: string): SearchClarification | null {
  if (isRatioClarificationQuery(normalizedQuery)) {
    return {
      rule: "ratio_scope",
      question: "Do you mean child care center ratios or family home child care ratios?",
      options: [
        toClarificationOption(
          "center_ratio",
          "Center child care",
          "What are the center staffing and ratio requirements?",
          "Ratios and group sizes for licensed child care centers."
        ),
        toClarificationOption(
          "family_home_ratio",
          "Family home child care",
          "What are the family home staffing and ratio requirements?",
          "Capacity and staffing rules for licensed family home child care."
        ),
      ],
    }
  }

  if (isOutdoorClarificationQuery(normalizedQuery)) {
    return {
      rule: "outdoor_scope",
      question: "Are you asking about outdoor play time or outdoor space requirements?",
      options: [
        toClarificationOption(
          "outdoor_time",
          "Outdoor play time",
          "How much outdoor play time is required?",
          "Minutes and daily activity requirements."
        ),
        toClarificationOption(
          "outdoor_space",
          "Outdoor space per child",
          "How much outdoor space is required per child?",
          "Square-footage and usable play-space requirements."
        ),
      ],
    }
  }

  if (isMilkClarificationQuery(normalizedQuery)) {
    return {
      rule: "milk_type",
      question: "Are you asking about formula bottles or breast milk?",
      options: [
        toClarificationOption(
          "bottle_rules",
          "Formula and bottles",
          "What are the bottle preparation rules at daycare?",
          "Bottle prep, warming, storage, and disposal rules."
        ),
        toClarificationOption(
          "breast_milk_rules",
          "Breast milk",
          "What are the breast milk rules at daycare?",
          "Storage, labeling, thawing, and discard rules for breast milk."
        ),
      ],
    }
  }

  return null
}

export function getClarificationForQuery(query: string): SearchClarification | null {
  return detectClarification(normalizeQuery(query))
}

function parseLabel(label: string): string {
  if (!manifest) return label

  if (manifest.labels.includes(label)) {
    return label
  }

  const match = label.match(/(\d+)$/)
  if (!match) return label

  const idx = Number.parseInt(match[1], 10)
  return manifest.labels[idx] || label
}

function isProtobufParseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /protobuf parsing failed/i.test(error.message)
}

async function clearTransformersCacheForModel(modelId: string): Promise<number> {
  if (typeof window === "undefined" || typeof caches === "undefined") return 0

  try {
    const cache = await caches.open("transformers-cache")
    const keys = await cache.keys()
    let deleted = 0
    for (const request of keys) {
      const isModelEntry = request.url.includes(`/models/${modelId}/`)
      if (!isModelEntry) continue
      if (await cache.delete(request)) {
        deleted += 1
      }
    }
    return deleted
  } catch {
    return 0
  }
}

function softmax(values: number[], temperature: number): number[] {
  const safeTemperature = temperature <= 0 ? 1 : temperature
  const scaled = values.map((v) => v / safeTemperature)
  const max = Math.max(...scaled)
  const exp = scaled.map((v) => Math.exp(v - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  return exp.map((v) => v / sum)
}

function toResult(record: AnswerBankRecord, score: number): SearchResult {
  const chunk: WacChunk = {
    id: record.sectionId,
    chunkId: `qa-${record.qaId}`,
    sectionTitle: record.sectionTitle,
    subsectionPath: "",
    content: record.answer,
    fullContent: `Q: ${record.question}\n\nA: ${record.answer}`,
    url: record.url,
    category: "",
  }

  return {
    chunk,
    question: record.question,
    score,
    source: "qa",
  }
}

function toDebugCandidate(record: AnswerBankRecord, score: number): SearchDebugCandidate {
  return {
    qaId: record.qaId,
    sectionId: record.sectionId,
    question: record.question,
    score,
    url: record.url,
  }
}

function canonicalizeQaId(qaId: string): string {
  return CANONICAL_QA_BY_ID[qaId] || qaId
}

function shouldOverrideLowMarginAbstain(
  confidence: number,
  topCandidates: SearchDebugCandidate[]
): boolean {
  if (topCandidates.length === 0) {
    return false
  }

  const topScore = topCandidates[0]?.score ?? 0
  const secondScore = topCandidates[1]?.score ?? 0
  const gap = topScore - secondScore
  const ratio = secondScore > 0 ? topScore / secondScore : Number.POSITIVE_INFINITY

  if (topScore >= 7.5 && gap >= 3) {
    return true
  }

  if (confidence < 0.22) {
    return false
  }

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

  if (
    /\b(food safety|safe food|food handling|kitchen safety|leftovers?|refrigerat(?:e|ion)|raw meat|expired food|food temp(?:erature)?|holding temperature)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0197")
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
    /\b(play outside every day|go outside every day|outside every day|daily outdoor|outdoor time required|outdoor play time|required outdoor play|active outdoor play|outside each day)\b/.test(
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

  if (
    /\b(general safety|safety requirements|safety rules|hazard|hazards|choking hazard|safe environment)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0165")
  }

  if (
    /\b(infant feeding|feeding plan|feeding rules|feeding infants|feeding babies|feed babies|feed infants|solid foods?|high chair|juice)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0285")
  }

  if (/\b(medication|medicine|melatonin|sunscreen|prescription)\b/.test(normalizedQuery)) {
    push("110-300-0215")
  }

  if (
    /\b(emergency preparedness|emergency plan|disaster plan|evacuation drill|evacuation plan|lockdown|shelter in place|fire drill)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0470")
  }

  if (
    /\b(staff qualification|staff qualifications|worker qualifications|qualifications do daycare workers need|background checks?|fingerprints?|preservice|work at a daycare|work at daycare)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0100")
  }

  if (
    /\b(family home|family child care|home daycare|family daycare|family provider|provider working alone|working alone)\b/.test(
      normalizedQuery
    ) &&
    /\b(ratio|capacity|group size|school age|infant|children|kids|staff|staffing|care for)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0355")
  }

  if (
    /\b(center|classroom|teacher|staff member)\b/.test(normalizedQuery) &&
    /\b(ratio|capacity|group size|school age|toddler|infant|preschool|kids|staffing)\b/.test(
      normalizedQuery
    )
  ) {
    push("110-300-0356")
  }

  if (/\b(how often do staff need training|training frequency|in service training)\b/.test(normalizedQuery)) {
    push("110-300-0107")
  }

  return hints
}

function getTopCandidatesForSection(
  sectionId: string,
  normalizedQuery: string,
  topK = 5
): SearchDebugCandidate[] {
  const section = sectionIndexes.get(sectionId)
  if (!section) {
    return []
  }

  const sectionScores = section.index.search(normalizedQuery)
  return section.records
    .map((entry, index) => ({
      record: entry.record,
      score: sectionScores[index] || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((row) => toDebugCandidate(row.record, row.score))
}

function maybeApplyHintedSectionOverride(
  normalizedQuery: string,
  topLabel: string,
  topCandidates: SearchDebugCandidate[],
  decision: IntentResult
): { topLabel: string; topCandidates: SearchDebugCandidate[]; overridden: boolean } {
  const hintedSections = inferHintedSections(normalizedQuery).filter((sectionId) => sectionId !== topLabel)
  if (hintedSections.length === 0) {
    return { topLabel, topCandidates, overridden: false }
  }

  const currentTopScore = topCandidates[0]?.score ?? 0
  let bestSectionId = topLabel
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

  if (bestSectionId === topLabel || bestCandidates.length === 0) {
    return { topLabel, topCandidates, overridden: false }
  }

  const delta = bestScore - currentTopScore
  if (decision.outcome === "abstain") {
    if (bestScore >= 3.2 && delta >= 0.6) {
      return { topLabel: bestSectionId, topCandidates: bestCandidates, overridden: true }
    }
    return { topLabel, topCandidates, overridden: false }
  }

  if (bestScore >= 4.5 && delta >= 1.2) {
    return { topLabel: bestSectionId, topCandidates: bestCandidates, overridden: true }
  }

  return { topLabel, topCandidates, overridden: false }
}

function buildSectionIndexes(): void {
  const answerByQaId = new Map(answerBank.map((record) => [record.qaId, record]))
  const queriesByQaId = new Map(queryBank.map((record) => [record.qaId, record.queries]))
  const exactQueries = new Map<string, string | null>()
  const bySection = new Map<
    string,
    Map<string, { record: AnswerBankRecord; queries: Set<string> }>
  >()

  for (const record of answerBank) {
    const canonicalQaId = canonicalizeQaId(record.qaId)
    const canonicalRecord = answerByQaId.get(canonicalQaId) || record
    const sectionId = canonicalRecord.sectionId
    const byCanonicalId = bySection.get(sectionId) || new Map()
    const existing = byCanonicalId.get(canonicalQaId) || {
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

    byCanonicalId.set(canonicalQaId, existing)
    bySection.set(sectionId, byCanonicalId)
  }

  sectionIndexes = new Map()
  for (const [sectionId, grouped] of bySection) {
    const records = Array.from(grouped.values()).map((entry) => ({
      record: entry.record,
      queries: Array.from(entry.queries),
    }))
    for (const entry of records) {
      for (const query of entry.queries) {
        const normalizedQuery = normalizeQuery(query)
        if (!normalizedQuery) continue
        const existingQaId = exactQueries.get(normalizedQuery)
        if (existingQaId === undefined) {
          exactQueries.set(normalizedQuery, entry.record.qaId)
        } else if (existingQaId !== entry.record.qaId) {
          exactQueries.set(normalizedQuery, null)
        }
      }
    }
    const docs = records.map((entry) => {
      return [entry.record.question, entry.record.answer, entry.record.sectionTitle, ...entry.queries].join(" ")
    })
    const index = new BM25Index()
    index.index(docs)
    sectionIndexes.set(sectionId, { index, records })
  }

  exactQueryQaIds = new Map(
    Array.from(exactQueries.entries()).filter((entry): entry is [string, string] => Boolean(entry[1]))
  )
}

export async function initIntentSearch(
  onProgress?: (progress: number) => void
): Promise<void> {
  if (isInitialized && classifier && manifest) {
    onProgress?.(1)
    return
  }

  if (initPromise) {
    await initPromise
    onProgress?.(1)
    return
  }

  initPromise = (async () => {
    configureTransformersEnv()

    const manifestRes = await fetch(resolveAssetUrl("models/intent-v1/manifest.json"))
    if (!manifestRes.ok) {
      throw new Error("Intent manifest missing")
    }

    const loadedManifest = (await manifestRes.json()) as IntentManifest
    manifest = loadedManifest
    onProgress?.(0.15)

    if (!loadedManifest.ready) {
      throw new Error("Intent model is not ready yet")
    }

    const answerRes = await fetch(resolveAssetUrl("data/intent-answer-bank.v1.json"))
    if (!answerRes.ok) {
      throw new Error("Intent answer bank missing")
    }
    answerBank = await answerRes.json()
    onProgress?.(0.35)

    const topicRes = await fetch(resolveAssetUrl("data/topic-suggestions.v1.json"))
    topicSuggestions = topicRes.ok ? await topicRes.json() : []
    onProgress?.(0.5)

    const queryBankRes = await fetch(resolveAssetUrl("data/intent-query-bank.v1.json"))
    queryBank = queryBankRes.ok ? await queryBankRes.json() : []
    buildSectionIndexes()
    onProgress?.(0.6)

    const pipelineFactory = pipeline as unknown as (
      task: "text-classification",
      model: string,
      options?: Record<string, unknown>
    ) => Promise<TextClassificationPipeline>
    const modelId = resolveModelId(loadedManifest.modelPath)
    if (typeof window !== "undefined") {
      console.info("[intent-runtime] init", {
        allowLocalModels: env.allowLocalModels,
        allowRemoteModels: env.allowRemoteModels,
        localModelPath: env.localModelPath,
        modelId,
      })
    }

    const pipelineOptions = {
      dtype: "fp32",
      device: "wasm",
      subfolder: "",
      model_file_name: "model",
      local_files_only: true,
    }

    try {
      classifier = await pipelineFactory("text-classification", modelId, pipelineOptions)
    } catch (error) {
      if (!isProtobufParseError(error)) {
        throw error
      }

      const deleted = await clearTransformersCacheForModel(modelId)
      if (typeof window !== "undefined") {
        console.warn("[intent-runtime] cleared stale transformers cache entries", {
          modelId,
          deleted,
        })
      }
      classifier = await pipelineFactory("text-classification", modelId, pipelineOptions)
    }

    onProgress?.(1)
    isInitialized = true
  })()

  try {
    await initPromise
  } finally {
    initPromise = null
  }
}

export function isIntentReady(): boolean {
  return isInitialized && classifier !== null && manifest !== null
}

export function getIntentTopicSuggestions(): TopicSuggestion[] {
  return topicSuggestions
}

function decideOutcome(
  label: string,
  confidence: number,
  margin: number,
  thresholds: { minConfidence: number; minMargin: number }
): IntentResult {
  if (label === NOT_COVERED) {
    return { outcome: "abstain", confidence, margin, reason: "ood" }
  }

  if (confidence < thresholds.minConfidence) {
    return { outcome: "abstain", confidence, margin, reason: "low_confidence" }
  }

  if (margin < thresholds.minMargin) {
    return { outcome: "abstain", confidence, margin, reason: "low_margin" }
  }

  return { outcome: "matched", qaId: label, confidence, margin }
}

export async function searchWithIntent(query: string, topK = 5): Promise<SearchResponse> {
  if (!classifier || !manifest) {
    throw new Error("Intent search not initialized")
  }

  const normalized = normalizeQuery(query)
  if (!normalized) {
    return {
      results: [],
      correctedQuery: null,
      confidence: "none",
      topicCovered: false,
      outcome: "abstain",
      debug: {
        engine: "intent_v1",
        normalizedQuery: normalized,
        reason: "low_confidence",
        topCandidates: [],
      },
    }
  }

  const clarification = detectClarification(normalized)
  if (clarification) {
    return {
      results: [],
      correctedQuery: null,
      confidence: "none",
      topicCovered: false,
      outcome: "clarify",
      clarification,
      debug: {
        engine: "intent_v1",
        normalizedQuery: normalized,
        reason: "clarify",
        clarification,
      },
    }
  }

  const exactQaId = exactQueryQaIds.get(normalized)
  if (exactQaId) {
    const exactRecord = answerBank.find((row) => row.qaId === exactQaId)
    if (exactRecord) {
      const exactCandidates = getTopCandidatesForSection(exactRecord.sectionId, normalized)
      const topCandidates =
        exactCandidates.length > 0
          ? exactCandidates
          : [toDebugCandidate(exactRecord, 1)]
      const activeRanked = topCandidates
        .map((candidate) => ({
          record: answerBank.find((row) => row.qaId === candidate.qaId) || exactRecord,
          score: candidate.score,
        }))
        .filter((row) => row.record)
      const results: SearchResult[] = activeRanked
        .slice(0, topK)
        .map((row, index) => toResult(row.record, index === 0 ? 1 : Math.max(0.01, 1 - index * 0.08)))

      return {
        results,
        correctedQuery: null,
        confidence: "high",
        topicCovered: true,
        outcome: "matched",
        debug: {
          engine: "intent_v1",
          normalizedQuery: normalized,
          topLabel: exactRecord.sectionId,
          confidence: 1,
          margin: 1,
          topSections: [{ label: exactRecord.sectionId, confidence: 1 }],
          topCandidates,
        },
      }
    }
  }

  const raw = (await classifier(normalized, {
    top_k: Math.max(topK, 3),
  })) as unknown

  const flat: ClassifierOutput[] = []
  const rawArray = Array.isArray(raw) ? raw : [raw]
  for (const item of rawArray) {
    if (Array.isArray(item)) {
      for (const nested of item) {
        flat.push(nested as ClassifierOutput)
      }
    } else {
      flat.push(item as ClassifierOutput)
    }
  }

  const parsed = flat
    .map((item) => {
      const qaId = parseLabel(item.label)
      return {
        qaId,
        score: item.score,
      }
    })
    .sort((a, b) => b.score - a.score)

  if (parsed.length === 0) {
    return {
      results: [],
      correctedQuery: null,
      confidence: "none",
      topicCovered: false,
      outcome: "abstain",
    }
  }

  const probs = softmax(parsed.map((item) => item.score), manifest.temperature || 1.0)
  const top1 = probs[0] ?? 0
  const top2 = probs[1] ?? 0
  const margin = top1 - top2
  const topLabel = parsed[0]?.qaId || NOT_COVERED
  const topSections = parsed.slice(0, 5).map((item, index) => ({
    label: item.qaId,
    confidence: probs[index] ?? 0,
  }))
  const thresholds = {
    minConfidence: manifest.thresholds?.minConfidence ?? DEFAULT_MATCH_THRESHOLD,
    minMargin: manifest.thresholds?.minMargin ?? DEFAULT_MARGIN_THRESHOLD,
  }
  const ranked = getTopCandidatesForSection(topLabel, normalized).map((candidate) => ({
    record: answerBank.find((row) => row.qaId === candidate.qaId)!,
    score: candidate.score,
  }))
  let topCandidates = ranked.slice(0, 5).map((row) => toDebugCandidate(row.record, row.score))
  const decision = decideOutcome(topLabel, top1, margin, thresholds)

  const hinted = maybeApplyHintedSectionOverride(normalized, topLabel, topCandidates, decision)
  const activeTopLabel = hinted.topLabel
  topCandidates = hinted.topCandidates

  if (hinted.overridden) {
    decision.outcome = "matched"
    decision.qaId = activeTopLabel
    delete decision.reason
  }

  if (
    decision.outcome === "abstain" &&
    decision.reason === "low_margin" &&
    shouldOverrideLowMarginAbstain(top1, topCandidates)
  ) {
    decision.outcome = "matched"
    decision.qaId = activeTopLabel
    delete decision.reason
  }

  if (topCandidates.length === 0) {
    return {
      results: [],
      correctedQuery: null,
      confidence: "none",
      topicCovered: false,
      outcome: "abstain",
      debug: {
        engine: "intent_v1",
        normalizedQuery: normalized,
        topLabel: activeTopLabel,
        confidence: top1,
        margin,
        reason: "no_candidates",
        topSections,
        topCandidates: [],
      },
    }
  }

  if (decision.outcome === "abstain") {
    return {
      results: [],
      correctedQuery: null,
      confidence: "none",
      topicCovered: false,
      outcome: "abstain",
      debug: {
        engine: "intent_v1",
        normalizedQuery: normalized,
        topLabel: activeTopLabel,
        confidence: top1,
        margin,
        reason: decision.reason,
        topSections,
        topCandidates,
      },
    }
  }

  const activeRanked = topCandidates
    .map((candidate) => ({
      record: answerBank.find((row) => row.qaId === candidate.qaId)!,
      score: candidate.score,
    }))
    .filter((row) => row.record)

  const results: SearchResult[] = activeRanked
    .slice(0, topK)
    .map((row, index) => toResult(row.record, index === 0 ? top1 : Math.max(0.01, top1 - index * 0.08)))

  return {
    results,
    correctedQuery: null,
    confidence: top1 > 0.9 ? "high" : top1 > 0.84 ? "medium" : "low",
    topicCovered: results.length > 0,
    outcome: results.length > 0 ? "matched" : "abstain",
    debug: {
      engine: "intent_v1",
      normalizedQuery: normalized,
      topLabel: activeTopLabel,
      confidence: top1,
      margin,
      topSections,
      topCandidates,
    },
  }
}
