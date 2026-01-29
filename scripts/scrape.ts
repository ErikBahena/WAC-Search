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
  // For embedding: combines title + content for better semantic matching
  embeddingText: string
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

// Extract time durations and emphasize them
function extractTimeEntities(content: string): string[] {
  const times: string[] = []

  // Match patterns like "one hour", "48 hours", "forty-eight hours", "30 minutes"
  const patterns = [
    /(\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty)[\s-]*(?:hour|minute|day|week|month)s?\b)/gi,
    /(\b\d+[\s-]*(?:hour|minute|day|week|month)s?\b)/gi,
    /(\bwithin\s+(?:one|two|\d+)[\s-]*(?:hour|minute|day)s?\b)/gi,
  ]

  for (const pattern of patterns) {
    const matches = content.match(pattern)
    if (matches) {
      times.push(...matches.map(m => m.toLowerCase().trim()))
    }
  }

  return [...new Set(times)]
}

// Generate potential questions this content answers - CONTENT-SPECIFIC
function generateQuestions(title: string, content: string, subsectionPath: string): string[] {
  const questions: string[] = []
  const lowerContent = content.toLowerCase()
  const lowerTitle = title.toLowerCase()

  // Bottle/formula time questions - only for disposal/expiration content
  if ((lowerContent.includes("throw away") || lowerContent.includes("discard")) &&
      (lowerContent.includes("bottle") || lowerContent.includes("formula"))) {
    questions.push("How long can a bottle sit out?")
    questions.push("When should formula be thrown away?")
    questions.push("How long is formula good for?")
    questions.push("When does formula expire?")
    questions.push("Can I save leftover formula?")
  }

  // Bottle cleaning - different questions
  if ((lowerContent.includes("clean") || lowerContent.includes("sanitiz") || lowerContent.includes("wash")) &&
      (lowerContent.includes("bottle") || lowerContent.includes("nipple"))) {
    questions.push("How to clean bottles?")
    questions.push("How to sanitize bottles?")
    questions.push("Do bottles need to be sterilized?")
  }

  // Leftover food questions
  if (lowerContent.includes("leftover") && (lowerContent.includes("hour") || lowerContent.includes("day"))) {
    questions.push("How long can leftover food be stored?")
    questions.push("When does leftover food expire?")
    questions.push("How long are leftovers good for?")
    questions.push("How long can puree be stored?")
    questions.push("How long is baby food good for after opening?")
  }

  // Refrigerator temperature
  if (lowerContent.includes("degrees") && (lowerContent.includes("refrigerat") || lowerContent.includes("freez"))) {
    questions.push("What temperature should the refrigerator be?")
    questions.push("How cold should the fridge be?")
    questions.push("What is the safe temperature for storing food?")
  }

  // Diaper changing frequency
  if (lowerContent.includes("diaper") && (lowerContent.includes("check") || lowerContent.includes("change"))) {
    questions.push("How often should diapers be changed?")
    questions.push("When to change diapers?")
    questions.push("How frequently do you check diapers?")
  }

  // Diaper changing procedures
  if (lowerContent.includes("diaper") && (lowerContent.includes("table") || lowerContent.includes("surface") || lowerContent.includes("sanit"))) {
    questions.push("How to properly change a diaper?")
    questions.push("What are diaper changing requirements?")
    questions.push("How to sanitize the changing table?")
  }

  // Choking hazards - must check BEFORE ratios since both can mention "infant"
  if (lowerContent.includes("chok") ||
      (lowerContent.includes("swallow") && lowerContent.includes("prevent")) ||
      (lowerContent.includes("aspiration") || lowerContent.includes("ingestion"))) {
    questions.push("What are choking hazards for children?")
    questions.push("What foods are choking hazards?")
    questions.push("How small should food be cut for babies?")
    questions.push("What size objects are choking hazards?")
    questions.push("How to prevent choking in infants and toddlers?")
  }

  // Food texture and cutting for babies
  if (lowerContent.includes("texture") && (lowerContent.includes("food") || lowerContent.includes("soft") || lowerContent.includes("mash"))) {
    questions.push("What food textures are safe for babies?")
    questions.push("How should food be prepared for infants?")
    questions.push("When can babies eat solid foods?")
  }

  // Staff ratios - only if NOT already matched choking
  if (!lowerContent.includes("chok") &&
      (lowerContent.includes("ratio") || (lowerContent.includes("staff") && lowerContent.includes("child")))) {
    questions.push("What is the staff to child ratio?")
    questions.push("How many children per staff member?")
    questions.push("How many kids can one teacher watch?")
    questions.push("What are the supervision requirements?")
  }

  // Age-specific ratios
  if (lowerContent.includes("infant") && (lowerContent.includes("ratio") || lowerContent.includes("per"))) {
    questions.push("What is the infant ratio?")
    questions.push("How many infants per caregiver?")
  }
  if (lowerContent.includes("toddler") && (lowerContent.includes("ratio") || lowerContent.includes("per"))) {
    questions.push("What is the toddler ratio?")
    questions.push("How many toddlers per teacher?")
  }

  // Space requirements
  if (lowerContent.includes("square feet") || (lowerContent.includes("space") && /\d+/.test(content))) {
    questions.push("How much space is required?")
    questions.push("What are the space requirements?")
    questions.push("How many square feet per child?")
  }

  // Fence/barrier requirements
  if (lowerContent.includes("fence") || lowerContent.includes("barrier")) {
    if (lowerContent.includes("height") || lowerContent.includes("inch") || lowerContent.includes("feet")) {
      questions.push("How tall does the fence need to be?")
      questions.push("What is the fence height requirement?")
      questions.push("What are playground fence requirements?")
    }
    if (lowerContent.includes("gap")) {
      questions.push("What size gaps are allowed in fences?")
    }
  }

  // Fire/emergency drills
  if (lowerContent.includes("drill") && (lowerContent.includes("fire") || lowerContent.includes("evacuation") || lowerContent.includes("emergency"))) {
    questions.push("How often are fire drills required?")
    questions.push("What are the fire drill requirements?")
    questions.push("How frequently must we practice evacuations?")
  }

  // Emergency evacuation/response procedures
  if ((lowerContent.includes("evacuat") || lowerContent.includes("actions to be taken") ||
       lowerContent.includes("disaster plan") || lowerContent.includes("during an")) &&
      (lowerContent.includes("fire") || lowerContent.includes("emergency") || lowerTitle.includes("preparedness"))) {
    questions.push("What do I do during a fire?")
    questions.push("What do I do in an emergency?")
    questions.push("What are the evacuation procedures?")
    questions.push("How do I evacuate children?")
    questions.push("What is the emergency plan?")
  }

  // Sleep/crib requirements
  if (lowerContent.includes("crib") || (lowerContent.includes("sleep") && lowerContent.includes("infant"))) {
    questions.push("What are the crib requirements?")
    questions.push("What are safe sleep requirements for infants?")
    questions.push("Can babies use blankets in cribs?")
    questions.push("What are SIDS prevention requirements?")
  }

  // Naptime/rest requirements
  if (lowerContent.includes("nap") || lowerContent.includes("rest period") || lowerContent.includes("quiet time")) {
    questions.push("What are naptime requirements?")
    questions.push("Do children need to take naps?")
    questions.push("What are rest time rules?")
  }

  // Background checks
  if (lowerContent.includes("background") && lowerContent.includes("check")) {
    questions.push("What are the background check requirements?")
    questions.push("Who needs a background check?")
    questions.push("Do I need fingerprinting?")
    questions.push("What disqualifies someone from working in childcare?")
  }

  // Staff qualifications
  if (lowerContent.includes("qualif") || lowerContent.includes("training") || lowerContent.includes("education")) {
    if (lowerContent.includes("staff") || lowerContent.includes("teacher") || lowerContent.includes("provider")) {
      questions.push("What training is required for childcare workers?")
      questions.push("What qualifications do teachers need?")
      questions.push("What education is required?")
    }
  }

  // Immunization requirements
  if (lowerContent.includes("immuniz") || lowerContent.includes("vaccin")) {
    questions.push("What immunizations are required?")
    questions.push("What are the vaccination requirements?")
    questions.push("Do children need to be vaccinated?")
    questions.push("What shots are required?")
  }

  // Medication storage and administration
  if (lowerContent.includes("medication")) {
    if (lowerContent.includes("store") || lowerContent.includes("lock")) {
      questions.push("How should medication be stored?")
      questions.push("Where to store medication?")
      questions.push("Does medicine need to be locked up?")
    }
    if (lowerContent.includes("administer") || lowerContent.includes("give") || lowerContent.includes("author")) {
      questions.push("Who can give medication to children?")
      questions.push("How to administer medication?")
      questions.push("What authorization is needed for medication?")
    }
  }

  // Handwashing
  if (lowerContent.includes("wash") && lowerContent.includes("hand")) {
    questions.push("When should hands be washed?")
    questions.push("What are the handwashing requirements?")
    questions.push("How often should children wash hands?")
  }

  // Illness/exclusion
  if (lowerContent.includes("ill") || lowerContent.includes("sick") || lowerContent.includes("exclude")) {
    if (lowerContent.includes("fever") || lowerContent.includes("temperature")) {
      questions.push("When should a sick child be sent home?")
      questions.push("What fever requires exclusion?")
    }
    if (lowerContent.includes("contagious") || lowerContent.includes("spread")) {
      questions.push("When can a child return after being sick?")
      questions.push("What illnesses require exclusion?")
    }
  }

  // Outdoor play
  if (lowerContent.includes("outdoor") && (lowerContent.includes("play") || lowerContent.includes("time"))) {
    questions.push("How much outdoor time is required?")
    questions.push("Do children need to play outside?")
    questions.push("What are outdoor play requirements?")
  }

  // Supervision
  if (lowerContent.includes("supervis") || lowerContent.includes("sight") || lowerContent.includes("sound")) {
    questions.push("What are the supervision requirements?")
    questions.push("Must children always be supervised?")
    questions.push("Can children be left alone?")
  }

  // First aid
  if (lowerContent.includes("first aid") || lowerContent.includes("cpr") || lowerContent.includes("emergency training")) {
    questions.push("Is first aid training required?")
    questions.push("Do staff need CPR certification?")
    questions.push("What emergency training is required?")
  }

  // Water activities/swimming
  if (lowerContent.includes("swim") || lowerContent.includes("pool") || lowerContent.includes("water activ")) {
    questions.push("What are the pool safety requirements?")
    questions.push("Can children go swimming?")
    questions.push("What are water activity rules?")
  }

  // TV/screen time
  if (lowerContent.includes("television") || lowerContent.includes("screen") || lowerContent.includes("video") || lowerContent.includes("electronic media")) {
    questions.push("Is TV allowed in daycare?")
    questions.push("What are screen time rules?")
    questions.push("Can children watch videos?")
  }

  // Discipline
  if (lowerContent.includes("discipline") || lowerContent.includes("behavior") || lowerContent.includes("guidance")) {
    questions.push("What discipline methods are allowed?")
    questions.push("Is timeout allowed?")
    questions.push("What behavior management is permitted?")
  }

  // Release/pickup
  if (lowerContent.includes("release") || lowerContent.includes("authorized") || lowerContent.includes("pick up")) {
    questions.push("Who can pick up my child?")
    questions.push("What are the release procedures?")
    questions.push("How do I authorize someone to pick up my child?")
  }

  // Licensing
  if (lowerContent.includes("license") && (lowerContent.includes("apply") || lowerContent.includes("require"))) {
    questions.push("How do I get a childcare license?")
    questions.push("What are the licensing requirements?")
    questions.push("Do I need a license to provide childcare?")
  }

  // Complaints
  if (lowerContent.includes("complaint") || lowerContent.includes("report") || lowerContent.includes("violation")) {
    questions.push("How do I file a complaint?")
    questions.push("How to report a daycare?")
    questions.push("Who do I contact about violations?")
  }

  // Field trips/transportation
  if (lowerContent.includes("transport") || lowerContent.includes("field trip") || lowerContent.includes("vehicle")) {
    questions.push("What are field trip requirements?")
    questions.push("Can daycares transport children?")
    questions.push("What are vehicle safety requirements?")
  }

  // Child abuse reporting
  if (lowerContent.includes("abuse") || lowerContent.includes("neglect") || lowerContent.includes("mandatory reporter")) {
    questions.push("What are child abuse reporting requirements?")
    questions.push("Who is a mandatory reporter?")
    questions.push("How to report suspected abuse?")
  }

  return questions
}

// Extract key subject keywords from content
function extractKeywords(title: string, content: string): string[] {
  const keywords: string[] = []
  const combined = (title + " " + content).toLowerCase()

  // Subject mappings
  const subjectKeywords: Record<string, string[]> = {
    "bottle|formula": ["bottle", "formula", "infant feeding", "sit out", "room temperature"],
    "diaper": ["diaper", "changing", "toileting", "potty"],
    "sleep|rest|nap": ["nap", "sleep", "rest", "crib", "cot"],
    "outdoor|playground": ["outdoor", "playground", "outside", "play area"],
    "ratio|staff.*child|child.*staff": ["ratio", "supervision", "staff", "how many children"],
    "medication|medicine": ["medication", "medicine", "drug", "dose"],
    "immunization|vaccine": ["immunization", "vaccine", "shots", "vaccination"],
    "emergency|fire|drill": ["emergency", "fire drill", "evacuation", "safety"],
    "food|meal|snack": ["food", "meal", "snack", "eating", "nutrition"],
  }

  for (const [pattern, kws] of Object.entries(subjectKeywords)) {
    if (new RegExp(pattern, "i").test(combined)) {
      keywords.push(...kws)
    }
  }

  return [...new Set(keywords)]
}

// Build enriched embedding text
function buildEmbeddingText(title: string, subsectionPath: string, content: string): string {
  const parts: string[] = []

  // Add generated questions
  const questions = generateQuestions(title, content, subsectionPath)
  if (questions.length > 0) {
    parts.push(questions.map(q => `Q: ${q}`).join(" "))
  }

  // Add title and subsection
  const pathStr = subsectionPath && subsectionPath !== "overview" ? ` ${subsectionPath}` : ""
  parts.push(`${title}${pathStr}: ${content}`)

  // Add emphasized time entities
  const times = extractTimeEntities(content)
  if (times.length > 0) {
    parts.push(`TIME: ${times.join(", ")}`)
  }

  // Add keywords
  const keywords = extractKeywords(title, content)
  if (keywords.length > 0) {
    parts.push(`Keywords: ${keywords.join(", ")}`)
  }

  return parts.join(" ").substring(0, 2000)
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
        embeddingText: buildEmbeddingText(sectionTitle, "", contentBody.substring(0, 1500)),
      })
    } else {
      // Create a chunk for each subsection
      // Track chunkIds to ensure uniqueness
      const usedChunkIds = new Set<string>()

      for (const sub of subsections) {
        let baseChunkId = `${id}-${sub.path.replace(/[()]/g, "")}`
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
          embeddingText: buildEmbeddingText(sectionTitle, sub.path, sub.content),
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
