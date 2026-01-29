import { readFileSync, writeFileSync, createWriteStream, existsSync, unlinkSync, renameSync } from "fs"
import { join } from "path"
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers"

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

// Use 256d for good balance of quality vs size (Matryoshka)
const TRUNCATE_DIM = 256

async function main() {
  const qaPath = join(process.cwd(), "public", "data", "qa-pairs.json")
  const qaPairs: QAPair[] = JSON.parse(readFileSync(qaPath, "utf-8"))

  console.log(`Loading EmbeddingGemma model...`)

  // Use the same pipeline as the browser
  const embedder = await pipeline(
    "feature-extraction",
    "onnx-community/embeddinggemma-300m-ONNX",
    { dtype: "q8" }
  ) as FeatureExtractionPipeline

  console.log(`Embedding ${qaPairs.length} questions...`)
  console.log(`Using ${TRUNCATE_DIM}d embeddings (Matryoshka truncation)`)

  const outPath = join(process.cwd(), "public", "data", "qa-embeddings.json")
  const tempPath = outPath + ".tmp"

  // Stream write to avoid memory buildup
  if (existsSync(tempPath)) unlinkSync(tempPath)
  const stream = createWriteStream(tempPath)
  stream.write("[\n")

  let written = 0
  const startTime = Date.now()

  for (let i = 0; i < qaPairs.length; i++) {
    const qa = qaPairs[i]

    try {
      // Use query prefix since Q&A questions match against user queries
      const prefixedText = `task: search result | query: ${qa.question}`

      const result = await embedder(prefixedText, {
        pooling: "mean",
        normalize: true,
      })

      const fullEmbedding = Array.from(result.data as Float32Array)
      const embedding = fullEmbedding.slice(0, TRUNCATE_DIM)

      const record = { question: qa.question, embedding }

      if (written > 0) stream.write(",\n")
      stream.write(JSON.stringify(record))
      written++

      if ((i + 1) % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = (i + 1) / elapsed
        const remaining = (qaPairs.length - i - 1) / rate
        console.log(`  ${i + 1}/${qaPairs.length} (${rate.toFixed(1)}/s, ~${remaining.toFixed(0)}s left)`)
      }
    } catch (error) {
      console.error(`Failed to embed question ${i}:`, error)
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

main().catch(console.error)
