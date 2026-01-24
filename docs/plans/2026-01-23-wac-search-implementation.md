# WAC Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a voice-first semantic search tool for WA child care regulations that runs entirely in the browser.

**Architecture:** Static React app with client-side ML inference. Build scripts scrape WAC content and generate embeddings via Ollama. At runtime, Transformers.js loads ONNX model to embed user queries and find similar regulation sections.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, @huggingface/transformers, Web Speech API

---

## Phase 1: Project Setup

### Task 1: Initialize Vite + React + TypeScript

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `index.html`

**Step 1: Create project with Vite**

Run:
```bash
npm create vite@latest . -- --template react-ts
```

Select: React, TypeScript

**Step 2: Install dependencies**

Run:
```bash
npm install
```

**Step 3: Verify it works**

Run:
```bash
npm run dev
```

Expected: Dev server starts, visit http://localhost:5173 shows Vite + React page

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: initialize Vite + React + TypeScript project"
```

---

### Task 2: Configure Tailwind CSS

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Modify: `src/index.css`

**Step 1: Install Tailwind**

Run:
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p --ts
```

**Step 2: Configure tailwind.config.ts**

Replace contents of `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#F9A8D4",
          dark: "#EC4899",
        },
        secondary: "#C4B5FD",
        background: "#FDF2F8",
        surface: "#FFFFFF",
        text: {
          DEFAULT: "#4C1D95",
          muted: "#9CA3AF",
        },
        success: "#86EFAC",
        warning: "#FCD34D",
      },
      fontFamily: {
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
}

export default config
```

**Step 3: Update src/index.css**

Replace contents:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap');

body {
  @apply bg-background text-text font-sans;
}
```

**Step 4: Update src/App.tsx to test Tailwind**

Replace contents:

```tsx
function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-3xl font-bold text-primary-dark">
        WAC Search
      </h1>
    </div>
  )
}

export default App
```

**Step 5: Verify Tailwind works**

Run:
```bash
npm run dev
```

Expected: Pink "WAC Search" heading centered on light pink background

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure Tailwind CSS with custom theme"
```

---

### Task 3: Install and Configure shadcn/ui

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`
- Modify: `tailwind.config.ts`

**Step 1: Install shadcn dependencies**

Run:
```bash
npm install clsx tailwind-merge class-variance-authority lucide-react
```

**Step 2: Create utility file**

Create `src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 3: Create components.json**

Create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": false
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Step 4: Update tsconfig.json for path aliases**

Add to `compilerOptions` in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 5: Update vite.config.ts for path aliases**

Replace `vite.config.ts`:

```typescript
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

**Step 6: Install Node types**

Run:
```bash
npm install -D @types/node
```

**Step 7: Add Button component**

Run:
```bash
npx shadcn@latest add button
```

**Step 8: Verify shadcn works**

Update `src/App.tsx`:

```tsx
import { Button } from "@/components/ui/button"

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold text-primary-dark">
        WAC Search
      </h1>
      <Button className="bg-primary-dark hover:bg-primary-dark/90">
        Test Button
      </Button>
    </div>
  )
}

export default App
```

Run:
```bash
npm run dev
```

Expected: Pink heading with styled button below

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: configure shadcn/ui with path aliases"
```

---

## Phase 2: Data Pipeline (Build Scripts)

### Task 4: Create Scraper Script

**Files:**
- Create: `scripts/scrape.ts`
- Create: `scripts/tsconfig.json`
- Modify: `package.json`

**Step 1: Install script dependencies**

Run:
```bash
npm install -D tsx cheerio node-fetch@2 @types/node-fetch
```

**Step 2: Create scripts/tsconfig.json**

Create `scripts/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["./**/*.ts"]
}
```

**Step 3: Create scraper**

Create `scripts/scrape.ts`:

```typescript
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
```

**Step 4: Add script to package.json**

Add to `scripts` in `package.json`:

```json
{
  "scripts": {
    "scrape": "tsx scripts/scrape.ts"
  }
}
```

**Step 5: Run scraper**

Run:
```bash
npm run scrape
```

Expected: Creates `public/data/sections.json` with parsed WAC sections

**Step 6: Verify output**

Run:
```bash
head -50 public/data/sections.json
```

Expected: JSON array of section objects with id, title, content, url, category

**Step 7: Commit**

```bash
git add scripts/ public/data/sections.json package.json
git commit -m "feat: add WAC scraper script"
```

---

### Task 5: Create Embedding Script

**Files:**
- Create: `scripts/embed.ts`
- Modify: `package.json`

**Step 1: Create embedding script**

Create `scripts/embed.ts`:

```typescript
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

interface WacSection {
  id: string
  title: string
  content: string
  url: string
  category: string
}

interface EmbeddingResult {
  id: string
  embedding: number[]
}

const OLLAMA_URL = "http://localhost:11434/api/embed"
const MODEL = "mxbai-embed-xsmall-v1"

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`)
  }

  const data = await response.json() as { embeddings: number[][] }
  return data.embeddings[0]
}

async function embedSections(): Promise<void> {
  const sectionsPath = join(process.cwd(), "public", "data", "sections.json")
  const sections: WacSection[] = JSON.parse(readFileSync(sectionsPath, "utf-8"))

  console.log(`Embedding ${sections.length} sections...`)

  const results: EmbeddingResult[] = []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const text = `${section.title}\n\n${section.content}`.substring(0, 2000)

    try {
      const embedding = await getEmbedding(text)
      results.push({ id: section.id, embedding })

      if ((i + 1) % 10 === 0) {
        console.log(`  ${i + 1}/${sections.length}`)
      }
    } catch (error) {
      console.error(`Failed to embed ${section.id}:`, error)
    }
  }

  const outPath = join(process.cwd(), "public", "data", "embeddings.json")
  writeFileSync(outPath, JSON.stringify(results))

  console.log(`Wrote ${results.length} embeddings to ${outPath}`)
}

embedSections().catch(console.error)
```

**Step 2: Add script to package.json**

Add to `scripts` in `package.json`:

```json
{
  "scripts": {
    "embed": "tsx scripts/embed.ts"
  }
}
```

**Step 3: Pull embedding model in Ollama**

Run:
```bash
ollama pull mxbai-embed-xsmall-v1
```

Expected: Model downloads (may take a few minutes)

**Step 4: Run embedding script**

Run:
```bash
npm run embed
```

Expected: Creates `public/data/embeddings.json` with vector data

**Step 5: Verify output**

Run:
```bash
wc -c public/data/embeddings.json
```

Expected: File size around 500KB-2MB depending on section count

**Step 6: Commit**

```bash
git add scripts/embed.ts public/data/embeddings.json package.json
git commit -m "feat: add embedding generation script"
```

---

### Task 6: Add Combined Build Script

**Files:**
- Create: `scripts/build-data.ts`
- Modify: `package.json`

**Step 1: Create orchestration script**

Create `scripts/build-data.ts`:

```typescript
import { execSync } from "child_process"

console.log("=== Building WAC Search Data ===\n")

console.log("Step 1: Scraping WAC 110-300...")
execSync("npm run scrape", { stdio: "inherit" })

console.log("\nStep 2: Generating embeddings...")
execSync("npm run embed", { stdio: "inherit" })

console.log("\n=== Data build complete ===")
```

**Step 2: Add to package.json**

Add to `scripts`:

```json
{
  "scripts": {
    "build:data": "tsx scripts/build-data.ts"
  }
}
```

**Step 3: Commit**

```bash
git add scripts/build-data.ts package.json
git commit -m "feat: add combined data build script"
```

---

## Phase 3: Core Search Functionality

### Task 7: Set Up Transformers.js

**Files:**
- Create: `src/lib/search.ts`
- Modify: `package.json`
- Modify: `vite.config.ts`

**Step 1: Install Transformers.js**

Run:
```bash
npm install @huggingface/transformers
```

**Step 2: Update Vite config for WASM**

Update `vite.config.ts`:

```typescript
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
})
```

**Step 3: Create search module**

Create `src/lib/search.ts`:

```typescript
import { pipeline, FeatureExtractionPipeline } from "@huggingface/transformers"

export interface WacSection {
  id: string
  title: string
  content: string
  url: string
  category: string
}

export interface SearchResult {
  section: WacSection
  score: number
}

let extractor: FeatureExtractionPipeline | null = null
let sections: WacSection[] = []
let embeddings: Map<string, number[]> = new Map()

export async function initSearch(
  onProgress?: (progress: number) => void
): Promise<void> {
  // Load sections
  const sectionsRes = await fetch("/data/sections.json")
  sections = await sectionsRes.json()

  // Load embeddings
  const embeddingsRes = await fetch("/data/embeddings.json")
  const embeddingsData: { id: string; embedding: number[] }[] = await embeddingsRes.json()

  embeddings = new Map(embeddingsData.map((e) => [e.id, e.embedding]))

  onProgress?.(0.3)

  // Load model
  extractor = await pipeline(
    "feature-extraction",
    "mixedbread-ai/mxbai-embed-xsmall-v1",
    {
      dtype: "q8",
      progress_callback: (p: { progress?: number }) => {
        if (p.progress) {
          onProgress?.(0.3 + p.progress * 0.007)
        }
      },
    }
  )

  onProgress?.(1)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function search(query: string, topK = 5): Promise<SearchResult[]> {
  if (!extractor) {
    throw new Error("Search not initialized")
  }

  // Generate query embedding
  const output = await extractor(query, { pooling: "mean", normalize: true })
  const queryEmbedding = Array.from(output.data as Float32Array)

  // Calculate similarities
  const results: SearchResult[] = []

  for (const section of sections) {
    const sectionEmbedding = embeddings.get(section.id)
    if (!sectionEmbedding) continue

    const score = cosineSimilarity(queryEmbedding, sectionEmbedding)
    results.push({ section, score })
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, topK)
}

export function isInitialized(): boolean {
  return extractor !== null
}
```

**Step 4: Commit**

```bash
git add src/lib/search.ts vite.config.ts package.json package-lock.json
git commit -m "feat: add Transformers.js search module"
```

---

### Task 8: Create Search Hook

**Files:**
- Create: `src/hooks/useSearch.ts`

**Step 1: Create the hook**

Create `src/hooks/useSearch.ts`:

```typescript
import { useState, useEffect, useCallback } from "react"
import { initSearch, search, isInitialized, SearchResult } from "@/lib/search"

interface UseSearchReturn {
  isLoading: boolean
  isReady: boolean
  progress: number
  results: SearchResult[]
  error: string | null
  doSearch: (query: string) => Promise<void>
}

export function useSearch(): UseSearchReturn {
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isInitialized()) {
      setIsReady(true)
      setIsLoading(false)
      return
    }

    initSearch(setProgress)
      .then(() => {
        setIsReady(true)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setIsLoading(false)
      })
  }, [])

  const doSearch = useCallback(async (query: string) => {
    if (!isReady) return

    try {
      setError(null)
      const searchResults = await search(query, 5)
      setResults(searchResults)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    }
  }, [isReady])

  return {
    isLoading,
    isReady,
    progress,
    results,
    error,
    doSearch,
  }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useSearch.ts
git commit -m "feat: add useSearch hook"
```

---

## Phase 4: Voice Input

### Task 9: Create Voice Hook

**Files:**
- Create: `src/hooks/useVoice.ts`
- Create: `src/lib/speech.ts`

**Step 1: Create speech utilities**

Create `src/lib/speech.ts`:

```typescript
export function isSpeechSupported(): boolean {
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window
}

export function createRecognition(): SpeechRecognition | null {
  if (!isSpeechSupported()) return null

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new SpeechRecognition()

  recognition.continuous = false
  recognition.interimResults = true
  recognition.lang = "en-US"

  return recognition
}
```

**Step 2: Add speech recognition types**

Create `src/types/speech.d.ts`:

```typescript
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: (event: SpeechRecognitionEvent) => void
  onerror: (event: SpeechRecognitionErrorEvent) => void
  onend: () => void
  onstart: () => void
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent {
  error: string
  message: string
}

interface Window {
  SpeechRecognition: new () => SpeechRecognition
  webkitSpeechRecognition: new () => SpeechRecognition
}
```

**Step 3: Create voice hook**

Create `src/hooks/useVoice.ts`:

```typescript
import { useState, useCallback, useRef, useEffect } from "react"
import { isSpeechSupported, createRecognition } from "@/lib/speech"

interface UseVoiceReturn {
  isSupported: boolean
  isListening: boolean
  transcript: string
  error: string | null
  startListening: () => void
  stopListening: () => void
}

export function useVoice(): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = isSpeechSupported()

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
    }
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition not supported")
      return
    }

    setError(null)
    setTranscript("")

    const recognition = createRecognition()
    if (!recognition) return

    recognitionRef.current = recognition

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      let finalTranscript = ""
      let interimTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      setTranscript(finalTranscript || interimTranscript)
    }

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied")
      } else if (event.error !== "aborted") {
        setError(`Speech error: ${event.error}`)
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.start()
  }, [isSupported])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  }
}
```

**Step 4: Commit**

```bash
git add src/lib/speech.ts src/hooks/useVoice.ts src/types/speech.d.ts
git commit -m "feat: add voice input with Web Speech API"
```

---

## Phase 5: UI Components

### Task 10: Create VoiceButton Component

**Files:**
- Create: `src/components/VoiceButton.tsx`

**Step 1: Create the component**

Create `src/components/VoiceButton.tsx`:

```tsx
import { Mic, MicOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoiceButtonProps {
  isListening: boolean
  isSupported: boolean
  onPress: () => void
  onRelease: () => void
  className?: string
}

export function VoiceButton({
  isListening,
  isSupported,
  onPress,
  onRelease,
  className,
}: VoiceButtonProps) {
  if (!isSupported) {
    return (
      <div className={cn(
        "w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center",
        className
      )}>
        <MicOff className="w-12 h-12 text-gray-400" />
      </div>
    )
  }

  return (
    <button
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onTouchStart={onPress}
      onTouchEnd={onRelease}
      className={cn(
        "w-32 h-32 rounded-full transition-all duration-200",
        "flex flex-col items-center justify-center gap-2",
        "shadow-lg shadow-primary/30",
        "active:scale-95",
        isListening
          ? "bg-gradient-to-br from-secondary to-primary-dark animate-pulse"
          : "bg-gradient-to-br from-primary to-primary-dark hover:scale-105",
        className
      )}
    >
      <Mic className={cn(
        "w-12 h-12",
        isListening ? "text-white" : "text-white/90"
      )} />
      <span className="text-white text-sm font-medium">
        {isListening ? "Listening..." : "Tap to ask"}
      </span>
    </button>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/VoiceButton.tsx
git commit -m "feat: add VoiceButton component"
```

---

### Task 11: Create SearchInput Component

**Files:**
- Create: `src/components/SearchInput.tsx`
- Add: shadcn input component

**Step 1: Add shadcn input**

Run:
```bash
npx shadcn@latest add input
```

**Step 2: Create SearchInput**

Create `src/components/SearchInput.tsx`:

```tsx
import { useState, FormEvent } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"

interface SearchInputProps {
  onSearch: (query: string) => void
  disabled?: boolean
  placeholder?: string
}

export function SearchInput({
  onSearch,
  disabled,
  placeholder = "or type your question...",
}: SearchInputProps) {
  const [query, setQuery] = useState("")

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="bg-white border-primary/30 focus:border-primary-dark rounded-xl"
      />
      <Button
        type="submit"
        disabled={disabled || !query.trim()}
        className="bg-primary-dark hover:bg-primary-dark/90 rounded-xl px-4"
      >
        <Search className="w-5 h-5" />
      </Button>
    </form>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/SearchInput.tsx src/components/ui/input.tsx
git commit -m "feat: add SearchInput component"
```

---

### Task 12: Create AnswerCard Component

**Files:**
- Create: `src/components/AnswerCard.tsx`
- Add: shadcn card component

**Step 1: Add shadcn card**

Run:
```bash
npx shadcn@latest add card
```

**Step 2: Create AnswerCard**

Create `src/components/AnswerCard.tsx`:

```tsx
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExternalLink, Copy, Share2, ChevronDown, ChevronUp, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { WacSection } from "@/lib/search"

interface AnswerCardProps {
  section: WacSection
  score: number
}

export function AnswerCard({ section, score }: AnswerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const isLowConfidence = score < 0.5

  const handleCopy = async () => {
    await navigator.clipboard.writeText(section.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `WAC ${section.id}`,
        text: section.title,
        url: section.url,
      })
    } else {
      handleCopy()
    }
  }

  // Extract key answer from content (first meaningful paragraph)
  const keyAnswer = section.content
    .split("\n")
    .filter((line) => line.trim().length > 20)
    .slice(0, 2)
    .join(" ")
    .substring(0, 300)

  return (
    <Card className={cn(
      "bg-white border-l-4 shadow-lg shadow-primary/10",
      isLowConfidence ? "border-l-warning" : "border-l-secondary"
    )}>
      <CardContent className="p-4 space-y-4">
        {isLowConfidence && (
          <div className="text-sm text-warning font-medium">
            ⚠️ This might not be an exact match
          </div>
        )}

        <p className="text-text leading-relaxed">
          {keyAnswer}...
        </p>

        <a
          href={section.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 p-3 rounded-xl",
            "bg-gradient-to-r from-primary/20 to-secondary/20",
            "hover:from-primary/30 hover:to-secondary/30",
            "transition-colors"
          )}
        >
          <ExternalLink className="w-5 h-5 text-primary-dark" />
          <div>
            <div className="font-semibold text-primary-dark">View on WAC website</div>
            <div className="text-sm text-text-muted">WAC {section.id}</div>
          </div>
        </a>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="rounded-xl border-primary/30"
          >
            {copied ? (
              <Check className="w-4 h-4 mr-1 text-success" />
            ) : (
              <Copy className="w-4 h-4 mr-1" />
            )}
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="rounded-xl border-primary/30"
          >
            <Share2 className="w-4 h-4 mr-1" />
            Share
          </Button>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          {expanded ? "Hide" : "Show"} full regulation text
        </button>

        {expanded && (
          <div className="p-3 bg-background rounded-xl text-sm leading-relaxed whitespace-pre-wrap">
            {section.content}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/AnswerCard.tsx src/components/ui/card.tsx
git commit -m "feat: add AnswerCard component"
```

---

### Task 13: Create QuickQuestions Component

**Files:**
- Create: `src/components/QuickQuestions.tsx`
- Create: `src/data/quick-questions.ts`

**Step 1: Create question data**

Create `src/data/quick-questions.ts`:

```typescript
export const quickQuestions = [
  { label: "Staff ratios", query: "What are the staff to child ratios?" },
  { label: "Bottle storage", query: "How long can a bottle sit out before refrigerating?" },
  { label: "Outdoor play", query: "How much outdoor play time is required?" },
  { label: "Nap rules", query: "What are the requirements for nap time and sleep?" },
  { label: "Diaper changing", query: "What are the diaper changing procedures?" },
  { label: "Hand washing", query: "When is hand washing required?" },
  { label: "First aid", query: "What first aid training is required?" },
  { label: "Medication", query: "What are the rules for giving medication to children?" },
]
```

**Step 2: Create component**

Create `src/components/QuickQuestions.tsx`:

```tsx
import { quickQuestions } from "@/data/quick-questions"
import { cn } from "@/lib/utils"

interface QuickQuestionsProps {
  onSelect: (query: string) => void
  disabled?: boolean
}

export function QuickQuestions({ onSelect, disabled }: QuickQuestionsProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted text-center">Quick questions:</p>
      <div className="flex flex-wrap justify-center gap-2">
        {quickQuestions.map((q) => (
          <button
            key={q.label}
            onClick={() => onSelect(q.query)}
            disabled={disabled}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium",
              "bg-white border border-primary/30",
              "hover:bg-primary/10 hover:border-primary",
              "transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/QuickQuestions.tsx src/data/quick-questions.ts
git commit -m "feat: add QuickQuestions component"
```

---

### Task 14: Create Disclaimer Component

**Files:**
- Create: `src/components/Disclaimer.tsx`

**Step 1: Create component**

Create `src/components/Disclaimer.tsx`:

```tsx
export function Disclaimer() {
  return (
    <div className="text-center text-xs text-text-muted space-y-1 px-4">
      <p>
        ⚠️ <strong>Unofficial resource.</strong> Not affiliated with or endorsed by the State of Washington.
      </p>
      <p>
        Always verify at{" "}
        <a
          href="https://app.leg.wa.gov/wac/default.aspx?cite=110-300"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary-dark"
        >
          leg.wa.gov
        </a>
      </p>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/Disclaimer.tsx
git commit -m "feat: add Disclaimer component"
```

---

### Task 15: Create LoadingScreen Component

**Files:**
- Create: `src/components/LoadingScreen.tsx`
- Add: shadcn progress component

**Step 1: Add shadcn progress**

Run:
```bash
npx shadcn@latest add progress
```

**Step 2: Create component**

Create `src/components/LoadingScreen.tsx`:

```tsx
import { Progress } from "@/components/ui/progress"

interface LoadingScreenProps {
  progress: number
}

export function LoadingScreen({ progress }: LoadingScreenProps) {
  const percentage = Math.round(progress * 100)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-6">
      <div className="text-4xl">✿</div>
      <h1 className="text-xl font-semibold text-primary-dark">
        Getting ready...
      </h1>
      <div className="w-full max-w-xs space-y-2">
        <Progress value={percentage} className="h-2" />
        <p className="text-center text-sm text-text-muted">
          {percentage}%
        </p>
      </div>
      <p className="text-sm text-text-muted text-center">
        First visit takes a moment
        <br />
        (cached for next time!)
      </p>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/LoadingScreen.tsx src/components/ui/progress.tsx
git commit -m "feat: add LoadingScreen component"
```

---

### Task 16: Create RelatedSections Component

**Files:**
- Create: `src/components/RelatedSections.tsx`

**Step 1: Create component**

Create `src/components/RelatedSections.tsx`:

```tsx
import { ChevronRight } from "lucide-react"
import { SearchResult } from "@/lib/search"

interface RelatedSectionsProps {
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
}

export function RelatedSections({ results, onSelect }: RelatedSectionsProps) {
  if (results.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted">Related sections:</p>
      <div className="space-y-1">
        {results.map((result) => (
          <button
            key={result.section.id}
            onClick={() => onSelect(result)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white hover:bg-primary/5 transition-colors text-left"
          >
            <span className="text-sm text-text truncate pr-2">
              {result.section.title}
            </span>
            <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/RelatedSections.tsx
git commit -m "feat: add RelatedSections component"
```

---

## Phase 6: Main App Assembly

### Task 17: Wire Up the Main App

**Files:**
- Modify: `src/App.tsx`

**Step 1: Assemble the app**

Replace `src/App.tsx`:

```tsx
import { useState, useEffect } from "react"
import { useSearch } from "@/hooks/useSearch"
import { useVoice } from "@/hooks/useVoice"
import { SearchResult } from "@/lib/search"
import { VoiceButton } from "@/components/VoiceButton"
import { SearchInput } from "@/components/SearchInput"
import { AnswerCard } from "@/components/AnswerCard"
import { QuickQuestions } from "@/components/QuickQuestions"
import { RelatedSections } from "@/components/RelatedSections"
import { Disclaimer } from "@/components/Disclaimer"
import { LoadingScreen } from "@/components/LoadingScreen"
import { ArrowLeft } from "lucide-react"

function App() {
  const { isLoading, isReady, progress, results, doSearch } = useSearch()
  const {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
  } = useVoice()

  const [currentQuery, setCurrentQuery] = useState("")
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

  // Auto-search when voice transcript is finalized
  useEffect(() => {
    if (transcript && !isListening) {
      setCurrentQuery(transcript)
      doSearch(transcript)
    }
  }, [transcript, isListening, doSearch])

  const handleSearch = (query: string) => {
    setCurrentQuery(query)
    setSelectedResult(null)
    doSearch(query)
  }

  const handleBack = () => {
    setCurrentQuery("")
    setSelectedResult(null)
  }

  const handleSelectRelated = (result: SearchResult) => {
    setSelectedResult(result)
  }

  if (isLoading) {
    return <LoadingScreen progress={progress} />
  }

  const primaryResult = selectedResult || results[0]
  const relatedResults = selectedResult
    ? results.filter((r) => r.section.id !== selectedResult.section.id)
    : results.slice(1)

  // Results view
  if (currentQuery && results.length > 0) {
    return (
      <div className="min-h-screen bg-background p-4 pb-24">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-primary-dark mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          New question
        </button>

        <div className="space-y-4 max-w-lg mx-auto">
          <p className="text-text-muted italic">"{currentQuery}"</p>

          {primaryResult && (
            <AnswerCard
              section={primaryResult.section}
              score={primaryResult.score}
            />
          )}

          <RelatedSections
            results={relatedResults}
            onSelect={handleSelectRelated}
          />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background py-4">
          <Disclaimer />
        </div>
      </div>
    )
  }

  // No results view
  if (currentQuery && results.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center gap-6">
        <div className="text-4xl">🤔</div>
        <h2 className="text-xl font-semibold text-primary-dark">
          Hmm, I'm not sure...
        </h2>
        <p className="text-text-muted text-center max-w-xs">
          I couldn't find a clear rule about "{currentQuery}"
        </p>
        <button
          onClick={handleBack}
          className="text-primary-dark underline"
        >
          Try a different question
        </button>
        <QuickQuestions onSelect={handleSearch} disabled={!isReady} />
      </div>
    )
  }

  // Home/search view
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-8">
      <h1 className="text-2xl font-bold text-primary-dark text-center">
        What's the rule about...
      </h1>

      <VoiceButton
        isListening={isListening}
        isSupported={isSupported}
        onPress={startListening}
        onRelease={stopListening}
      />

      {isListening && transcript && (
        <p className="text-text-muted italic animate-pulse">
          "{transcript}"
        </p>
      )}

      <SearchInput onSearch={handleSearch} disabled={!isReady} />

      <QuickQuestions onSelect={handleSearch} disabled={!isReady} />

      <Disclaimer />
    </div>
  )
}

export default App
```

**Step 2: Verify the app runs**

Run:
```bash
npm run dev
```

Expected: App loads with voice button, search input, quick questions, and disclaimer

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire up main app with all components"
```

---

## Phase 7: Polish & Deploy

### Task 18: Add Meta Tags and PWA Basics

**Files:**
- Modify: `index.html`
- Create: `public/favicon.svg`

**Step 1: Update index.html**

Replace `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#FDF2F8" />
    <meta name="description" content="Quickly find answers to child care regulation questions from Washington's WAC 110-300" />

    <!-- Open Graph -->
    <meta property="og:title" content="WAC Search - Child Care Regulations" />
    <meta property="og:description" content="Voice-first search for WA child care rules" />
    <meta property="og:type" content="website" />

    <title>WAC Search - WA Child Care Regulations</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 2: Create favicon**

Create `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#FDF2F8"/>
  <circle cx="50" cy="50" r="35" fill="#F9A8D4"/>
  <text x="50" y="62" text-anchor="middle" font-size="40">✿</text>
</svg>
```

**Step 3: Commit**

```bash
git add index.html public/favicon.svg
git commit -m "feat: add meta tags and favicon"
```

---

### Task 19: Production Build Test

**Files:**
- None (testing only)

**Step 1: Run production build**

Run:
```bash
npm run build
```

Expected: Build completes successfully, outputs to `dist/`

**Step 2: Preview production build**

Run:
```bash
npm run preview
```

Expected: App runs at http://localhost:4173

**Step 3: Verify functionality**

- [ ] Loading screen appears with progress
- [ ] Voice button works (on supported browsers)
- [ ] Text search works
- [ ] Quick questions work
- [ ] Answer cards display correctly
- [ ] External links open WAC website
- [ ] Copy/share buttons work

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: production build adjustments"
```

---

### Task 20: Deploy to Vercel

**Files:**
- Create: `vercel.json` (optional)

**Step 1: Install Vercel CLI**

Run:
```bash
npm install -g vercel
```

**Step 2: Deploy**

Run:
```bash
vercel
```

Follow prompts:
- Set up and deploy? **Y**
- Which scope? **Select your account**
- Link to existing project? **N**
- Project name? **wac-search**
- Directory? **./**
- Override settings? **N**

**Step 3: Deploy to production**

Run:
```bash
vercel --prod
```

Expected: Returns production URL

**Step 4: Commit vercel config if created**

```bash
git add vercel.json .vercel
git commit -m "chore: add Vercel configuration"
```

---

## Summary

**Total Tasks:** 20

**Phase Breakdown:**
1. Project Setup (Tasks 1-3)
2. Data Pipeline (Tasks 4-6)
3. Core Search (Tasks 7-8)
4. Voice Input (Task 9)
5. UI Components (Tasks 10-16)
6. Main App (Task 17)
7. Polish & Deploy (Tasks 18-20)

**Key Commands:**
- `npm run dev` - Start dev server
- `npm run build:data` - Regenerate WAC data + embeddings
- `npm run build` - Production build
- `vercel --prod` - Deploy to production
