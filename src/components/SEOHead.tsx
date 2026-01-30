import { Head } from "vite-react-ssg"

const SITE_URL = "https://wac-search.vercel.app"
const SITE_NAME = "WAC Search"
const DEFAULT_DESCRIPTION = "Search Washington State child care regulations (WAC 110-300). Get quick answers about ratios, food safety, licensing requirements, and more."

interface SEOHeadProps {
  title?: string
  description?: string
  path?: string
  type?: "website" | "article"
}

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "",
  type = "website",
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - Washington Child Care Regulations`
  const canonicalUrl = `${SITE_URL}${path}`
  const ogImageUrl = `${SITE_URL}/og-image.png`

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={title || SITE_NAME} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title || SITE_NAME} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImageUrl} />
    </Head>
  )
}

interface QuestionSEOHeadProps {
  question: string
  answer: string
  slug: string
  sectionId: string
}

export function QuestionSEOHead({
  question,
  answer,
  slug,
  sectionId,
}: QuestionSEOHeadProps) {
  // Truncate answer for meta description (max ~155 chars)
  const truncatedAnswer = answer.length > 150
    ? answer.slice(0, 147) + "..."
    : answer

  const description = `${truncatedAnswer} Source: WAC ${sectionId}`

  return (
    <SEOHead
      title={question}
      description={description}
      path={`/q/${slug}`}
      type="article"
    />
  )
}
