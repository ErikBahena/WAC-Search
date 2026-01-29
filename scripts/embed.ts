import { readFileSync, createWriteStream, existsSync, unlinkSync, renameSync } from "fs"
import { join } from "path"
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers"

interface WacChunk {
  id: string
  chunkId: string
  sectionTitle: string
  subsectionPath: string
  content: string
  fullContent: string
  url: string
  category: string
  embeddingText: string
}

// Use 256d for good balance of quality vs size (Matryoshka)
const TRUNCATE_DIM = 256

async function embedChunks(): Promise<void> {
  const chunksPath = join(process.cwd(), "public", "data", "chunks.json")
  const chunks: WacChunk[] = JSON.parse(readFileSync(chunksPath, "utf-8"))

  console.log(`Loading EmbeddingGemma model...`)

  // Use the same pipeline as the browser
  const embedder = await pipeline(
    "feature-extraction",
    "onnx-community/embeddinggemma-300m-ONNX",
    { dtype: "q8" }
  ) as FeatureExtractionPipeline

  console.log(`Embedding ${chunks.length} chunks...`)
  console.log(`Using ${TRUNCATE_DIM}d embeddings (Matryoshka truncation)`)

  const outPath = join(process.cwd(), "public", "data", "embeddings.json")
  const tempPath = outPath + ".tmp"

  // Stream write to avoid memory buildup
  if (existsSync(tempPath)) unlinkSync(tempPath)
  const stream = createWriteStream(tempPath)
  stream.write("[\n")

  let written = 0
  const startTime = Date.now()

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    try {
      // Use document prefix for content chunks
      const prefixedText = `title: none | text: ${chunk.embeddingText}`

      const result = await embedder(prefixedText, {
        pooling: "mean",
        normalize: true,
      })

      const fullEmbedding = Array.from(result.data as Float32Array)
      const embedding = fullEmbedding.slice(0, TRUNCATE_DIM)

      const record = { chunkId: chunk.chunkId, embedding }

      if (written > 0) stream.write(",\n")
      stream.write(JSON.stringify(record))
      written++

      if ((i + 1) % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = (i + 1) / elapsed
        const remaining = (chunks.length - i - 1) / rate
        console.log(`  ${i + 1}/${chunks.length} (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s left)`)
      }
    } catch (error) {
      console.error(`Failed to embed chunk ${i} (${chunk.chunkId}):`, error)
    }
  }

  stream.write("\n]")
  stream.end()

  // Wait for stream to finish
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
  })

  // Rename temp to final
  if (existsSync(outPath)) unlinkSync(outPath)
  renameSync(tempPath, outPath)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nWrote ${written} embeddings to ${outPath} in ${elapsed}s`)
}

embedChunks().catch(console.error)
