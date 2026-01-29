# Landing Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a clear, professional landing page that explains what the tool does for first-time visitors while streamlining the experience for returning users.

**Architecture:** Extract landing page into a dedicated component with hero section, search UI, and feature cards. Use localStorage to track returning visitors and show them a minimal view with search only.

**Tech Stack:** React, TypeScript, Tailwind CSS, localStorage

---

### Task 1: Create Feature Cards Component

**Files:**
- Create: `src/components/FeatureCards.tsx`

**Step 1: Create the FeatureCards component**

```tsx
import { Search, Mic, Zap } from "lucide-react"

const features = [
  {
    icon: Search,
    title: "Semantic Search",
    description: "Ask questions in plain English. No need to know exact legal terminology.",
  },
  {
    icon: Mic,
    title: "Voice Input",
    description: "Tap to speak your question. Perfect when your hands are busy.",
  },
  {
    icon: Zap,
    title: "Instant Answers",
    description: "Find the relevant regulation in seconds, not minutes of scrolling.",
  },
]

export function FeatureCards() {
  return (
    <div className="grid gap-4 max-w-lg mx-auto">
      {features.map((feature) => (
        <div
          key={feature.title}
          className="flex items-start gap-4 p-4 rounded-xl bg-white border border-primary/20"
        >
          <div className="p-2 rounded-lg bg-primary/10 text-primary-dark">
            <feature.icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-primary-dark">{feature.title}</h3>
            <p className="text-sm text-text-muted">{feature.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/FeatureCards.tsx
git commit -m "feat: add FeatureCards component for landing page"
```

---

### Task 2: Create Hero Section Component

**Files:**
- Create: `src/components/Hero.tsx`

**Step 1: Create the Hero component**

```tsx
interface HeroProps {
  showFullContent: boolean
  onLearnMore: () => void
}

export function Hero({ showFullContent, onLearnMore }: HeroProps) {
  if (!showFullContent) {
    return (
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-primary-dark">
          WAC 110-300 Search
        </h1>
        <button
          onClick={onLearnMore}
          className="text-sm text-primary hover:text-primary-dark underline"
        >
          What is this?
        </button>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-primary-dark">
        WAC 110-300 Search
      </h1>
      <p className="text-lg text-text-muted">
        Washington State childcare regulations, searchable in plain English.
      </p>
      <div className="text-sm text-text-muted space-y-2">
        <p>
          <strong className="text-primary-dark">The problem:</strong> 300+ sections of dense legal text.
          Ctrl+F doesn't understand your question. You don't have time to dig.
        </p>
        <p>
          <strong className="text-primary-dark">The solution:</strong> Ask a question in your own words.
          Get the relevant regulation instantly.
        </p>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/Hero.tsx
git commit -m "feat: add Hero component with problem/solution messaging"
```

---

### Task 3: Create useReturningUser Hook

**Files:**
- Create: `src/hooks/useReturningUser.ts`

**Step 1: Create the hook**

```ts
import { useState, useEffect } from "react"

const STORAGE_KEY = "wac-search-visited"

export function useReturningUser() {
  const [isReturningUser, setIsReturningUser] = useState<boolean | null>(null)
  const [showFullLanding, setShowFullLanding] = useState(true)

  useEffect(() => {
    const visited = localStorage.getItem(STORAGE_KEY)
    const returning = visited === "true"
    setIsReturningUser(returning)
    setShowFullLanding(!returning)

    if (!returning) {
      localStorage.setItem(STORAGE_KEY, "true")
    }
  }, [])

  const revealFullLanding = () => {
    setShowFullLanding(true)
  }

  return {
    isReturningUser,
    showFullLanding,
    revealFullLanding,
  }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useReturningUser.ts
git commit -m "feat: add useReturningUser hook for localStorage tracking"
```

---

### Task 4: Update App.tsx with New Landing Page

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update imports and add hook**

Add imports at the top:
```tsx
import { Hero } from "@/components/Hero"
import { FeatureCards } from "@/components/FeatureCards"
import { useReturningUser } from "@/hooks/useReturningUser"
```

**Step 2: Add hook usage in App function**

After the existing hooks, add:
```tsx
const { showFullLanding, revealFullLanding } = useReturningUser()
```

**Step 3: Replace the home/search view section**

Replace the current home view (lines ~130-155) with:
```tsx
// Home/search view
return (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-6">
    <Hero showFullContent={showFullLanding} onLearnMore={revealFullLanding} />

    <div className="flex flex-col items-center gap-6 w-full">
      <VoiceButton
        isStarting={isStarting}
        isListening={isListening}
        isSupported={isSupported}
        onClick={toggleListening}
      />

      {isListening && transcript && (
        <p className="text-text-muted italic animate-pulse">
          "{transcript}"
        </p>
      )}

      <SearchInput onSearch={handleSearch} disabled={!isReady} />

      <QuickQuestions onSelect={handleSearch} disabled={!isReady} />
    </div>

    {showFullLanding && <FeatureCards />}

    <Disclaimer />
  </div>
)
```

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate Hero and FeatureCards into landing page"
```

---

### Task 5: Visual Polish and Testing

**Files:**
- Modify: `src/components/Hero.tsx` (if needed)
- Modify: `src/components/FeatureCards.tsx` (if needed)

**Step 1: Test in browser**

Run: `npm run dev`

Verify:
1. First visit shows full landing with hero, problem/solution, features
2. Refresh shows minimal view with "What is this?" link
3. Clicking "What is this?" reveals full content
4. Search and voice still work correctly
5. Clear localStorage and verify first-visit experience returns

**Step 2: Adjust spacing/styling if needed**

Review the visual balance and adjust Tailwind classes as needed for:
- Vertical spacing between sections
- Text sizes and weights
- Card styling

**Step 3: Final commit**

```bash
git add -A
git commit -m "style: polish landing page spacing and visual balance"
```

---

## Summary

This plan creates:
1. `FeatureCards.tsx` - Three cards highlighting semantic search, voice input, instant answers
2. `Hero.tsx` - Adaptive hero with full/minimal modes and problem/solution messaging
3. `useReturningUser.ts` - localStorage hook to track returning visitors
4. Updated `App.tsx` - Integrates new components with conditional rendering
