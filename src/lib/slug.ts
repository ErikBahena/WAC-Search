import type { QAPair } from "./search-qa"

/**
 * Generate a URL-friendly slug from a question string.
 * Format: lowercase, hyphenated, truncated to ~50 chars
 */
export function generateSlug(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, "") // Trim leading/trailing hyphens
    .slice(0, 50) // Truncate to ~50 chars
    .replace(/-+$/, "") // Remove trailing hyphen after truncation
}

/**
 * Build a map from slug to QA pair for efficient lookup
 */
export function buildSlugMap(qaPairs: QAPair[]): Map<string, QAPair> {
  const map = new Map<string, QAPair>()
  for (const qa of qaPairs) {
    const slug = generateSlug(qa.question)
    // Handle slug collisions by keeping the first one
    if (!map.has(slug)) {
      map.set(slug, qa)
    }
  }
  return map
}

/**
 * Get all unique slugs for static path generation
 */
export function getAllSlugs(qaPairs: QAPair[]): string[] {
  const slugMap = buildSlugMap(qaPairs)
  return Array.from(slugMap.keys())
}
