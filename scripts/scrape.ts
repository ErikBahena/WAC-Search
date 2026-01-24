import fetch from "node-fetch"
import * as cheerio from "cheerio"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"

const WAC_URL = "https://app.leg.wa.gov/wac/default.aspx?cite=110-300&full=true"

interface WacSection {
  id: string
  title: string
  content: string
  url: string
  category: string
}

async function scrapeWac(): Promise<void> {
  console.log("Fetching WAC 110-300...")

  const response = await fetch(WAC_URL)
  const html = await response.text()

  console.log(`Fetched ${html.length} bytes`)

  const $ = cheerio.load(html)
  const sections: WacSection[] = []

  // Each section starts with an anchor like <a name="110-300-0010">
  $("a[name^='110-300-']").each((_, anchor) => {
    const id = $(anchor).attr("name")
    if (!id) return

    // Find the section content - it's in the surrounding structure
    const sectionEl = $(anchor).parent()

    // Get title - usually in a bold or header element after anchor
    const titleEl = sectionEl.find("b, strong, h3, h4").first()
    const title = titleEl.text().trim() || `WAC ${id}`

    // Get content - the text content of the section
    const content = sectionEl.text().trim()

    // Skip if no meaningful content
    if (content.length < 50) return

    // Determine category from ID ranges (approximate)
    const numericPart = parseInt(id.split("-")[2] || "0")
    let category = "General"
    if (numericPart < 100) category = "Definitions & Intent"
    else if (numericPart < 200) category = "Licensing"
    else if (numericPart < 300) category = "Staffing"
    else if (numericPart < 400) category = "Health & Safety"
    else if (numericPart < 500) category = "Food & Nutrition"
    else category = "Program Administration"

    sections.push({
      id,
      title,
      content: content.substring(0, 5000), // Limit content length
      url: `https://app.leg.wa.gov/wac/default.aspx?cite=${id}`,
      category,
    })
  })

  console.log(`Parsed ${sections.length} sections`)

  // Write output
  const outDir = join(process.cwd(), "public", "data")
  mkdirSync(outDir, { recursive: true })

  const outPath = join(outDir, "sections.json")
  writeFileSync(outPath, JSON.stringify(sections, null, 2))

  console.log(`Wrote ${outPath}`)
}

scrapeWac().catch(console.error)
