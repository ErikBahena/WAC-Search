import { Head } from "vite-react-ssg"

const SITE_URL = "https://wac-search.vercel.app"

/**
 * FAQPage schema for individual Q&A pages
 * https://schema.org/FAQPage
 */
interface FAQPageSchemaProps {
  question: string
  answer: string
}

export function FAQPageSchema({ question, answer }: FAQPageSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      },
    ],
  }

  return (
    <Head>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Head>
  )
}

/**
 * WebSite schema with SearchAction for the home page
 * https://schema.org/WebSite
 */
export function WebSiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "WAC Search",
    description:
      "Search Washington State child care regulations (WAC 110-300)",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term}`,
      "query-input": "required name=search_term",
    },
  }

  return (
    <Head>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Head>
  )
}
