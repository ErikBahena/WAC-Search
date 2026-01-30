# SEO Implementation Design

## Goal

Rank for child care compliance questions (e.g., "how many kids per caregiver Washington", "can I microwave baby bottle daycare").

## Problem

Current SPA is invisible to search engines. Content loads via JavaScript, so Google sees an empty page.

## Solution Overview

1. **Static pre-rendering** - Generate 126 static HTML pages at build time
2. **Structured data** - FAQ schema (JSON-LD) for search engine understanding
3. **SEO hygiene** - robots.txt, sitemap.xml, meta tags, OG image

---

## 1. URL Structure & Routing

```
/                    → Home (search interface)
/q/[slug]            → Individual Q&A page (126 pages)
```

Slug format: lowercase, hyphenated, truncated to ~50 chars
- `/q/how-long-can-bottle-sit-out`
- `/q/can-i-microwave-baby-bottle`

---

## 2. Static Site Generation

**Tool:** `vite-react-ssg` with `react-router-dom`

**Build output:**
```
dist/
  index.html
  q/
    how-long-can-bottle-sit-out/index.html
    can-i-microwave-baby-bottle/index.html
    ... (126 total)
  robots.txt
  sitemap.xml
  og-image.png
```

---

## 3. Individual Q&A Page Structure

```
┌─────────────────────────────────────────────┐
│  WAC Search (header)                        │
├─────────────────────────────────────────────┤
│  <h1>Question text</h1>                     │
│                                             │
│  Answer Card with source citation           │
│                                             │
│  Related Questions (same WAC section)       │
│                                             │
│  Search box: Ask another question           │
├─────────────────────────────────────────────┤
│  Disclaimer footer                          │
└─────────────────────────────────────────────┘
```

---

## 4. Meta Tags (per page)

```html
<title>Can I microwave a baby bottle? | WAC Search</title>
<meta name="description" content="No. You must not heat a bottle in a microwave. Use warm running water, a container of water, or a bottle warmer instead. Source: WAC 110-300-0280">
<link rel="canonical" href="https://wacsearch.com/q/can-i-microwave-baby-bottle">

<!-- Open Graph -->
<meta property="og:title" content="Can I microwave a baby bottle?">
<meta property="og:description" content="No. You must not heat a bottle...">
<meta property="og:type" content="article">
<meta property="og:url" content="https://wacsearch.com/q/can-i-microwave-baby-bottle">
<meta property="og:image" content="https://wacsearch.com/og-image.png">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Can I microwave a baby bottle?">
<meta name="twitter:description" content="No. You must not heat...">
<meta name="twitter:image" content="https://wacsearch.com/og-image.png">
```

---

## 5. Structured Data (JSON-LD)

**Per Q&A page:**
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "Can I microwave a baby bottle?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "No. You must not heat a bottle in a microwave. Use warm running water, a container of water, or a bottle warmer instead."
    }
  }]
}
```

**Home page:**
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "WAC Search",
  "description": "Search Washington State child care regulations (WAC 110-300)",
  "url": "https://wacsearch.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://wacsearch.com/?q={search_term}",
    "query-input": "required name=search_term"
  }
}
```

---

## 6. SEO Hygiene Files

**robots.txt:**
```
User-agent: *
Allow: /

Sitemap: https://wacsearch.com/sitemap.xml
```

**sitemap.xml:** Auto-generated at build time listing all URLs with priorities.

**og-image.png:** 1200x630px branded image with "WAC Search - Washington Child Care Regulations"

---

## Implementation Steps

1. Install dependencies: `vite-react-ssg`, `react-router-dom`
2. Create route configuration with `getStaticPaths()` for Q&A slugs
3. Create `QuestionPage` component for `/q/[slug]` routes
4. Add `<Head>` component for dynamic meta tags
5. Add JSON-LD structured data components
6. Create `robots.txt` in public folder
7. Add sitemap generation to build script
8. Create OG image
9. Update build script to use `vite-react-ssg`
10. Test with Google Rich Results Test and Lighthouse

---

## Sources

- [vite-react-ssg](https://github.com/Daydreamer-riri/vite-react-ssg)
- [FAQ Schema Best Practices](https://studiohawk.com.au/blog/faq-schema/)
- [Schema Markup in 2026](https://almcorp.com/blog/schema-markup-detailed-guide-2026-serp-visibility/)
- [SPA SEO Optimization](https://prerender.io/blog/how-to-optimize-single-page-applications-spas-for-crawling-and-indexing/)
