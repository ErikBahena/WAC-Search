<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="WAC Search Logo">
</p>

<h1 align="center">WAC Search</h1>

<p align="center">
  <strong>Instant answers to Washington State child care regulation questions</strong>
</p>

<p align="center">
  <a href="https://wac-search.vercel.app">Live Site</a> •
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" alt="Vite 7">
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
</p>

---

## 🌸 About

WAC Search helps child care providers, parents, and licensing specialists quickly find answers from Washington's WAC 110-300 regulations. Instead of scrolling through dense legal text, just ask a question in plain English.

> *"Can I microwave a baby bottle?"*
> *"What's the staff-to-child ratio for infants?"*
> *"How long can formula sit out?"*

Get clear, sourced answers in seconds.

---

## ✨ Features

| | Feature | Description |
|---|---------|-------------|
| 🎤 | **Voice Search** | Tap and ask — perfect for busy caregivers |
| 🧠 | **Intent Search** | Precision-first ONNX intent matching in the browser |
| 📱 | **Mobile-First** | Designed for on-the-go use |
| 🔗 | **Source Links** | Every answer links to official WAC text |
| ⚡ | **Instant Results** | Client-side ML — no server round-trips |
| 🔒 | **Privacy-First** | All processing happens in your browser |
| 🌐 | **SEO Optimized** | 126 pre-rendered pages for search engines |

---

## 🛠 Tech Stack

```
Frontend        React 19 + TypeScript + Tailwind CSS 4
Build           Vite 7 + vite-react-ssg (Static Site Generation)
Search          ONNX intent classifier (browser-only)
Voice           Web Speech API
Hosting         Vercel (Static)
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20.19+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/wac-search.git
cd wac-search

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build

```bash
# Build for production (generates 126 static pages)
npm run build

# Preview production build
npm run preview
```

### Intent Model Pipeline

```bash
# 1) Ensure grounded QA + intent assets are current
npm run qa:ground
npm run qa:verify
npm run build:intent-assets

# 2) Python deps
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -r ml/requirements.txt

# 3) Generate/train/export pipeline
npm run ml:generate:in-scope
npm run ml:generate:ood
npm run ml:validate
npm run ml:train
npm run ml:calibrate
npm run ml:evaluate
npm run ml:export:onnx
npm run ml:quantize
npm run ml:evaluate:runtime
```

### Runtime Diagnostics

- `npm run ml:evaluate:runtime`
  - Runs the shipped ONNX runtime in Node against `ml/data/test.jsonl` and `ml/data/challenge.jsonl`
  - Writes `/Users/erik/Developer/projects/wac-search/ml/artifacts/intent-runtime-evaluation.json`
  - Reports latency, abstain-heavy sections, section-routing misses, and QA confusion pairs
- In `npm run dev`, the search UI shows a dev-only debug panel with:
  - normalized query
  - predicted section
  - confidence and margin
  - top section scores
  - top reranked QA candidates

---

## 📁 Project Structure

```
src/
├── components/     # React components
├── hooks/          # Custom hooks (useSearch, useVoice)
├── lib/            # Utilities (search, speech, slug)
├── pages/          # Page components for SSG
└── routes.tsx      # Route configuration

public/
├── data/           # Grounded chunks, QA pairs, answer bank, suggestions
└── models/         # ONNX intent model assets

scripts/
├── scrape.ts       # Scrape WAC regulations
├── ground-qa.ts    # Ground QA pairs to regulation text
├── verify-qa-grounding.ts
└── generate-sitemap.ts
```

---

## 📊 How It Works

```
┌─────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  Your       │───▶│  Intent Engine      │───▶│  Answer Bank /      │
│  Question   │    │  (intent_v1)        │    │  Regulation Chunks  │
└─────────────┘    └─────────────────────┘    └──────────┬──────────┘
                                                         │
                                                ┌────────▼────────┐
                                                │  Answer + Source│
                                                └─────────────────┘
```

1. **You ask** a question (voice or text)
2. **Intent engine classifies** the question into a grounded QA section
3. **Search reranks** the best local QA candidates in that section
4. **You get** a clear answer with official WAC source

---

## 🌐 SEO

This project generates **126 static HTML pages** at build time:

- `/` — Home page with search
- `/q/[slug]` — Individual Q&A pages (e.g., `/q/can-i-microwave-a-baby-bottle`)

Each page includes:
- Semantic HTML with proper headings
- Meta tags (title, description, Open Graph, Twitter)
- JSON-LD structured data (FAQPage schema)
- Canonical URLs
- XML sitemap

---

## 📜 Data Source

All content is derived from [WAC 110-300](https://app.leg.wa.gov/wac/default.aspx?cite=110-300) — Washington State's official child care licensing regulations.

**Disclaimer:** This is an unofficial resource. Not affiliated with or endorsed by the State of Washington. Always verify information at [leg.wa.gov](https://app.leg.wa.gov/wac/default.aspx?cite=110-300).

---

## 💝 Dedication

<p align="center">
  <em>
    Built with love for <strong>Jessie</strong> — my fiancée and future wife.<br>
    Your dedication to the children you care for inspires me every day.
  </em>
</p>

---

<p align="center">
  Made with ☕ and 🌸 in Washington State
</p>
