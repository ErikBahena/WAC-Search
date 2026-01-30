/**
 * Convert OG image SVG to PNG
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const svgPath = path.join(__dirname, "../public/og-image.svg")
  const pngPath = path.join(__dirname, "../public/og-image.png")

  console.log("Converting OG image SVG to PNG...")

  const svgBuffer = fs.readFileSync(svgPath)

  await sharp(svgBuffer)
    .resize(1200, 630)
    .png()
    .toFile(pngPath)

  console.log(`OG image written to ${pngPath}`)
}

main().catch(console.error)
