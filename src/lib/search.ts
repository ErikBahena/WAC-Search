import { pipeline, FeatureExtractionPipeline } from "@huggingface/transformers"

export interface WacSection {
  id: string
  title: string
  content: string
  url: string
  category: string
}

export interface SearchResult {
  section: WacSection
  score: number
}

let extractor: FeatureExtractionPipeline | null = null
let sections: WacSection[] = []
let embeddings: Map<string, number[]> = new Map()

export async function initSearch(
  onProgress?: (progress: number) => void
): Promise<void> {
  // Load sections
  const sectionsRes = await fetch("/data/sections.json")
  sections = await sectionsRes.json()

  // Load embeddings
  const embeddingsRes = await fetch("/data/embeddings.json")
  const embeddingsData: { id: string; embedding: number[] }[] = await embeddingsRes.json()

  embeddings = new Map(embeddingsData.map((e) => [e.id, e.embedding]))

  onProgress?.(0.3)

  // Load model
  extractor = await pipeline(
    "feature-extraction",
    "mixedbread-ai/mxbai-embed-xsmall-v1",
    {
      dtype: "q8",
      progress_callback: (p: { progress?: number }) => {
        if (p.progress) {
          onProgress?.(0.3 + p.progress * 0.007)
        }
      },
    }
  )

  onProgress?.(1)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function search(query: string, topK = 5): Promise<SearchResult[]> {
  if (!extractor) {
    throw new Error("Search not initialized")
  }

  // Generate query embedding
  const output = await extractor(query, { pooling: "mean", normalize: true })
  const queryEmbedding = Array.from(output.data as Float32Array)

  // Calculate similarities
  const results: SearchResult[] = []

  for (const section of sections) {
    const sectionEmbedding = embeddings.get(section.id)
    if (!sectionEmbedding) continue

    const score = cosineSimilarity(queryEmbedding, sectionEmbedding)
    results.push({ section, score })
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, topK)
}

export function isInitialized(): boolean {
  return extractor !== null
}
