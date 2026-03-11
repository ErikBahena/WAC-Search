import { execSync } from "child_process"

console.log("=== Building WAC Search Data ===\n")

console.log("Step 1: Scraping WAC 110-300...")
execSync("npm run scrape", { stdio: "inherit" })

console.log("\nStep 2: Grounding Q&A pairs to source sections...")
execSync("npm run qa:ground", { stdio: "inherit" })

console.log("\nStep 3: Verifying 100% Q&A grounding...")
execSync("npm run qa:verify", { stdio: "inherit" })

console.log("\nStep 4: Building intent runtime assets...")
execSync("npm run build:intent-assets", { stdio: "inherit" })

console.log("\n=== Data build complete ===")
