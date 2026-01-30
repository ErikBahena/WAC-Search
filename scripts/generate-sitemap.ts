/**
 * Generate sitemap.xml from QA pairs
 * Run this script after the build to generate the sitemap
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface QAPair {
  question: string
  answer: string
  sectionId: string
  sectionTitle: string
  url: string
}

function generateSlug(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "")
}

function getAllSlugs(qaPairs: QAPair[]): string[] {
  const slugSet = new Set<string>()
  for (const qa of qaPairs) {
    const slug = generateSlug(qa.question)
    slugSet.add(slug)
  }
  return Array.from(slugSet)
}

const SITE_URL = "https://wac-search.vercel.app"

function generateSitemap(slugs: string[]): string {
  const today = new Date().toISOString().split("T")[0]

  const urls = [
    // Home page - highest priority
    {
      loc: SITE_URL,
      priority: "1.0",
      changefreq: "weekly",
    },
    // Q&A pages
    ...slugs.map((slug) => ({
      loc: `${SITE_URL}/q/${slug}`,
      priority: "0.8",
      changefreq: "monthly",
    })),
  ]

  const urlEntries = urls
    .map(
      (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`
}

async function main() {
  // Load QA pairs
  const qaPairsPath = path.join(__dirname, "../public/data/qa-pairs.json")
  const qaPairs: QAPair[] = JSON.parse(fs.readFileSync(qaPairsPath, "utf-8"))

  // Generate slugs
  const slugs = getAllSlugs(qaPairs)
  console.log(`Generating sitemap for ${slugs.length} Q&A pages...`)

  // Generate sitemap
  const sitemap = generateSitemap(slugs)

  // Write to dist folder
  const distPath = path.join(__dirname, "../dist/sitemap.xml")
  fs.writeFileSync(distPath, sitemap)
  console.log(`Sitemap written to ${distPath}`)

  // Also write to public folder for development
  const publicPath = path.join(__dirname, "../public/sitemap.xml")
  fs.writeFileSync(publicPath, sitemap)
  console.log(`Sitemap written to ${publicPath}`)
}

main().catch(console.error)
