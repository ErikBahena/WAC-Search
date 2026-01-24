# WAC Search - Design Document

A voice-first search tool to help child care professionals quickly find answers in Washington's WAC 110-300 regulations.

## Problem

Child care workers need quick answers to practical questions ("How long can a bottle sit out?") buried in dense legal documents. Currently they must manually search through 100+ pages of regulations.

## Solution

A mobile-first web app with semantic search that runs entirely in the browser. Users speak or type questions in plain language and get direct answers with links to official sources.

## Architecture

```
BUILD TIME (developer machine with Ollama)
├── Scrape WAC 110-300 from leg.wa.gov
├── Parse HTML into structured sections
├── Generate embeddings via mxbai-embed-xsmall-v1
└── Export sections.json + embeddings.json

RUNTIME (user's browser)
├── Load ONNX model via Transformers.js (~25MB, cached)
├── User speaks/types question
├── Generate query embedding in browser
├── Cosine similarity against pre-computed embeddings
└── Display best matches as Q&A response
```

## Tech Stack

| Component | Choice |
|-----------|--------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + shadcn/ui |
| ML Runtime | @huggingface/transformers |
| Embedding Model | mxbai-embed-xsmall-v1 (24MB quantized, 384 dims) |
| Voice | Web Speech API (native browser) |
| Fonts | Nunito (Google Fonts) |
| Deploy | Vercel (static, free tier) |

## Visual Design

**Aesthetic:** Playful, pastel, friendly - approachable for stressed daycare workers.

**Color Palette:**
```
Primary:      #F9A8D4 (Pink 300)
Primary Dark: #EC4899 (Pink 500)
Secondary:    #C4B5FD (Violet 300)
Background:   #FDF2F8 (Pink 50)
Surface:      #FFFFFF
Text:         #4C1D95 (Violet 900)
Success:      #86EFAC (Green 300)
Warning:      #FCD34D (Amber 300)
Gradient:     linear-gradient(135deg, #FBCFE8, #DDD6FE)
```

**Typography:**
- Font: Nunito (rounded, friendly)
- Headings: 700 weight
- Body: 500 weight, generous line-height

**Components:**
- Extra rounded corners (16-20px radius)
- Pill-shaped buttons
- Soft pink/purple tinted shadows
- Large touch targets (min 48px)

## UI Flow

### Screen 1: Home / Search

Voice-first design with large mic button as primary action.

```
┌─────────────────────────────────┐
│                                 │
│     What's the rule about...    │
│                                 │
│        ┌───────────┐            │
│        │    🎤     │            │
│        │  Tap to   │            │
│        │   ask     │            │
│        └───────────┘            │
│                                 │
│   ┌───────────────────────────┐ │
│   │ or type your question...  │ │
│   └───────────────────────────┘ │
│                                 │
│  Quick questions:               │
│  ┌─────────────┐ ┌────────────┐ │
│  │ Staff ratios│ │ Bottle time│ │
│  └─────────────┘ └────────────┘ │
│                                 │
└─────────────────────────────────┘
```

### Screen 1b: Listening State

Live transcription with audio waveform visualization.

```
┌─────────────────────────────────┐
│                                 │
│        ┌───────────┐            │
│        │ ◉ ◉ ◉ ◉ ◉ │            │
│        │    🎤     │            │
│        │ Listening │            │
│        └───────────┘            │
│                                 │
│   "how long can a bottle..."    │
│                                 │
│        [ Cancel ]               │
│                                 │
└─────────────────────────────────┘
```

### Screen 2: Answer View

Clear answer with prominent link to official source.

```
┌─────────────────────────────────┐
│  ← New question                 │
│                                 │
│  "How long can a bottle sit out │
│   before refrigerating?"        │
│                                 │
│  ┌─────────────────────────────┐│
│  │                             ││
│  │  Prepared bottles must be   ││
│  │  refrigerated if not used   ││
│  │  within ONE HOUR.           ││
│  │                             ││
│  │  ┌─────────────────────────┐││
│  │  │ 🔗 View on WAC website  │││
│  │  │    WAC 110-300-0235     │││
│  │  └─────────────────────────┘││
│  │                             ││
│  │  [ 📋 Copy link ] [ 📤 Share]││
│  │                             ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ 📄 Full regulation text   ▼ ││
│  └─────────────────────────────┘│
│                                 │
│  Related:                       │
│  ├─ Food temperature safety  →  │
│  ├─ Infant feeding practices →  │
│  └─ Kitchen sanitation       →  │
│                                 │
│  ─────────────────────────────  │
│  ⚠️ Unofficial. Always verify   │
│  at leg.wa.gov                  │
└─────────────────────────────────┘
```

## Data Pipeline

### Step 1: Scrape
```
Source: https://app.leg.wa.gov/wac/default.aspx?cite=110-300&full=true
Output: Raw HTML
```

### Step 2: Parse
Each WAC section becomes:
```json
{
  "id": "110-300-0235",
  "title": "What are the requirements for preparing infant formula...",
  "content": "Full regulation text...",
  "url": "https://app.leg.wa.gov/wac/default.aspx?cite=110-300-0235",
  "category": "Food and Nutrition"
}
```

### Step 3: Embed
- Run mxbai-embed-xsmall-v1 via local Ollama
- Generate 384-dim vector per section
- Store as JSON

### Output Files
```
public/data/
├── sections.json      (~200KB)
└── embeddings.json    (~500KB)
```

## Project Structure

```
wac-search/
├── public/
│   ├── data/
│   │   ├── sections.json
│   │   └── embeddings.json
│   └── model/
│       └── mxbai-embed-xsmall/
│
├── scripts/
│   ├── scrape.ts
│   ├── parse.ts
│   ├── embed.ts
│   └── build-data.ts
│
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn
│   │   ├── SearchInput.tsx
│   │   ├── VoiceButton.tsx
│   │   ├── AnswerCard.tsx
│   │   ├── RelatedSections.tsx
│   │   ├── QuickQuestions.tsx
│   │   └── Disclaimer.tsx
│   │
│   ├── lib/
│   │   ├── search.ts
│   │   ├── similarity.ts
│   │   └── speech.ts
│   │
│   ├── hooks/
│   │   ├── useSearch.ts
│   │   ├── useVoice.ts
│   │   └── useModel.ts
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Error States

| State | Handling |
|-------|----------|
| Model loading | Progress bar with friendly message, "First visit takes a moment (cached for next time!)" |
| No match found | "Hmm, I'm not sure..." with topic browse options |
| Voice not supported | Graceful fallback to text input with explanation |
| Mic permission denied | Instructions to enable in browser |
| Low confidence result | Warning banner, "This might not be exact" with alternatives |
| Offline | Works fully offline after first load (all cached) |

## Legal Disclaimer

Required on every page:
- "This is an unofficial resource, not affiliated with or endorsed by the State of Washington"
- "For official, current regulations, visit app.leg.wa.gov"
- "Information may be outdated. Always verify with official sources before making compliance decisions."

No state seals or logos.

## Performance Targets

| Metric | Target |
|--------|--------|
| First Load (HTML/CSS/JS) | ~200KB gzipped |
| Model Files | ~25MB (lazy loaded, cached forever) |
| Time to Interactive | < 2 seconds |
| Time to Search Ready | 5-15 seconds (first visit) |
| Subsequent Visits | < 2 seconds (all cached) |
| Lighthouse Performance | 90+ |
| Lighthouse Accessibility | 100 |

## Deployment

- **Host:** Vercel (free tier, static)
- **Build:** `npm run build`
- **Data update:** Run `npm run build:data` monthly or when WAC changes
- **Custom domain:** Optional (e.g., wac.help)

## Future Enhancements (Not in Scope)

- PWA with "Add to Home Screen"
- Multiple states (Oregon, California, etc.)
- Other WA documents (health dept, fire codes)
- Pre-generated Q&A for even faster results
