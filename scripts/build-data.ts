import { execSync } from "child_process"

console.log("=== Building WAC Search Data ===\n")

console.log("Step 1: Scraping WAC 110-300...")
execSync("npm run scrape", { stdio: "inherit" })

console.log("\nStep 2: Generating embeddings...")
execSync("npm run embed", { stdio: "inherit" })

console.log("\n=== Data build complete ===")
