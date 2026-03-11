import fetch from "node-fetch"
import * as cheerio from "cheerio"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"

const WAC_URL = "https://app.leg.wa.gov/wac/default.aspx?cite=110-300&full=true"

interface WacChunk {
  id: string // e.g., "110-300-0280"
  chunkId: string // e.g., "110-300-0280-3-l"
  sectionTitle: string // e.g., "Bottle preparation"
  subsectionPath: string // e.g., "(3)(l)"
  content: string // The actual text of this chunk
  fullContent: string // Full section content for "view more"
  url: string
  category: string
}

// Parse subsection markers like (1), (a), (i)
function parseSubsections(text: string): { path: string; content: string }[] {
  const chunks: { path: string; content: string }[] = []

  // Match patterns like (1), (2)(a), (3)(l)(i), etc.
  // Split on major numbered sections first
  const majorSections = text.split(/(?=\(\d+\)\s)/)

  for (const majorSection of majorSections) {
    if (!majorSection.trim()) continue

    // Check if this starts with a number like (1)
    const majorMatch = majorSection.match(/^\((\d+)\)\s*/)
    if (!majorMatch) {
      // This is intro text before (1), treat as overview
      if (majorSection.trim().length > 30) {
        chunks.push({ path: "overview", content: majorSection.trim() })
      }
      continue
    }

    const majorNum = majorMatch[1]
    const majorContent = majorSection.slice(majorMatch[0].length)

    // Check for lettered subsections (a), (b), etc.
    const letterSections = majorContent.split(/(?=\([a-z]\)\s)/i)

    if (letterSections.length === 1) {
      // No letter subsections, just add the major section
      const content = majorContent.trim()
      if (content.length > 20) {
        chunks.push({ path: `(${majorNum})`, content })
      }
    } else {
      for (const letterSection of letterSections) {
        if (!letterSection.trim()) continue

        const letterMatch = letterSection.match(/^\(([a-z])\)\s*/i)
        if (!letterMatch) {
          // Text before first (a), part of the major section intro
          if (letterSection.trim().length > 20) {
            chunks.push({ path: `(${majorNum})`, content: letterSection.trim() })
          }
          continue
        }

        const letter = letterMatch[1].toLowerCase()
        const letterContent = letterSection.slice(letterMatch[0].length)

        // Check for roman numeral subsections (i), (ii), etc.
        const romanSections = letterContent.split(/(?=\((?:i{1,3}|iv|vi{0,3})\)\s)/i)

        if (romanSections.length === 1) {
          const content = letterContent.trim()
          if (content.length > 10) {
            chunks.push({ path: `(${majorNum})(${letter})`, content })
          }
        } else {
          for (const romanSection of romanSections) {
            if (!romanSection.trim()) continue

            const romanMatch = romanSection.match(/^\((i{1,3}|iv|vi{0,3})\)\s*/i)
            if (!romanMatch) {
              if (romanSection.trim().length > 10) {
                chunks.push({ path: `(${majorNum})(${letter})`, content: romanSection.trim() })
              }
              continue
            }

            const roman = romanMatch[1].toLowerCase()
            const romanContent = romanSection.slice(romanMatch[0].length).trim()
            if (romanContent.length > 10) {
              chunks.push({ path: `(${majorNum})(${letter})(${roman})`, content: romanContent })
            }
          }
        }
      }
    }
  }

  return chunks
}

function cleanTitle(title: string): string {
  // Remove "PDF110-300-XXXX" prefix and clean up
  return title
    .replace(/^PDF\d+-\d+-\d+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

function extractTitleFromContent(content: string): string {
  // The title is usually the first sentence before (1) or any substantial text
  // Look for text ending with a period before (1)
  const match = content.match(/^([^(]+?)\.\s*\(1\)/)
  if (match) {
    return match[1].replace(/\s+/g, " ").trim()
  }
  // Fallback: first sentence
  const firstSentence = content.match(/^([^.]+)\./)
  if (firstSentence) {
    return firstSentence[1].replace(/\s+/g, " ").trim()
  }
  return ""
}

function getCategory(numericPart: number): string {
  if (numericPart < 100) return "Definitions & Intent"
  if (numericPart < 200) return "Licensing"
  if (numericPart < 300) return "Staffing"
  if (numericPart < 400) return "Health & Safety"
  if (numericPart < 500) return "Food & Nutrition"
  return "Program Administration"
}

async function scrapeWac(): Promise<void> {
  console.log("Fetching WAC 110-300...")

  const response = await fetch(WAC_URL)
  const html = await response.text()

  console.log(`Fetched ${html.length} bytes`)

  const $ = cheerio.load(html)
  const chunks: WacChunk[] = []
  let sectionCount = 0

  // Each section starts with an anchor like <a name="110-300-0010">
  $("a[name^='110-300-']").each((_, anchor) => {
    const id = $(anchor).attr("name")
    if (!id) return

    const sectionEl = $(anchor).parent()

    // Get full content
    const fullContent = sectionEl.text().trim()

    // Get title - try from HTML first, then extract from content
    const titleEl = sectionEl.find("b, strong, h3, h4").first()
    let sectionTitle = cleanTitle(titleEl.text().trim())
    if (!sectionTitle || sectionTitle === `WAC ${id}`) {
      sectionTitle = cleanTitle(extractTitleFromContent(fullContent))
    }
    if (!sectionTitle) {
      sectionTitle = `WAC ${id}`
    }

    // Skip if no meaningful content
    if (fullContent.length < 50) return

    sectionCount++

    // Get category
    const numericPart = parseInt(id.split("-")[2] || "0")
    const category = getCategory(numericPart)
    const url = `https://app.leg.wa.gov/wac/default.aspx?cite=${id}`

    // Clean the content (remove the title from the beginning)
    let contentBody = fullContent
    // Try to remove "Title." pattern from beginning
    const titlePattern = new RegExp(`^${sectionTitle}\\.?\\s*`, "i")
    contentBody = contentBody.replace(titlePattern, "").trim()

    // Remove citation info at the end [WSR ...]
    contentBody = contentBody.replace(/\[WSR\s+[\s\S]*?\]\.?$/g, "").trim()

    // Parse into subsections
    const subsections = parseSubsections(contentBody)

    if (subsections.length === 0) {
      // No subsections found, create one chunk for the whole section
      chunks.push({
        id,
        chunkId: `${id}-full`,
        sectionTitle,
        subsectionPath: "",
        content: contentBody.substring(0, 1500),
        fullContent: contentBody.substring(0, 5000),
        url,
        category,
      })
    } else {
      // Create a chunk for each subsection
      // Track chunkIds to ensure uniqueness
      const usedChunkIds = new Set<string>()

      for (const sub of subsections) {
        const baseChunkId = `${id}-${sub.path.replace(/[()]/g, "")}`
        let chunkId = baseChunkId
        let suffix = 2

        // Ensure uniqueness by adding numeric suffix if needed
        while (usedChunkIds.has(chunkId)) {
          chunkId = `${baseChunkId}-${suffix}`
          suffix++
        }
        usedChunkIds.add(chunkId)

        chunks.push({
          id,
          chunkId,
          sectionTitle,
          subsectionPath: sub.path,
          content: sub.content,
          fullContent: contentBody.substring(0, 5000),
          url,
          category,
        })
      }
    }
  })

  console.log(`Parsed ${sectionCount} sections into ${chunks.length} chunks`)

  // Write output
  const outDir = join(process.cwd(), "public", "data")
  mkdirSync(outDir, { recursive: true })

  const outPath = join(outDir, "chunks.json")
  writeFileSync(outPath, JSON.stringify(chunks, null, 2))

  console.log(`Wrote ${outPath}`)

  // Also write a summary
  const categories = chunks.reduce((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log("Chunks by category:", categories)
}

scrapeWac().catch(console.error)
