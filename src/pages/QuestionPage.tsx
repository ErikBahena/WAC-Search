import { useParams, Link, useNavigate } from "react-router-dom"
import { useMemo } from "react"
import { ArrowLeft, ExternalLink, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SearchInput } from "@/components/SearchInput"
import { Disclaimer } from "@/components/Disclaimer"
import { QuestionSEOHead } from "@/components/SEOHead"
import { FAQPageSchema } from "@/components/StructuredData"
import { Analytics } from "@vercel/analytics/react"
import { generateSlug, buildSlugMap } from "@/lib/slug"
import type { QAPair } from "@/lib/search-qa"

// Import QA data statically for SSG
import qaPairs from "../../public/data/qa-pairs.json"

const typedQAPairs = qaPairs as QAPair[]

export default function QuestionPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  // Build slug map and find current QA
  const { currentQA, relatedQuestions } = useMemo(() => {
    const map = buildSlugMap(typedQAPairs)
    const qa = slug ? map.get(slug) : undefined

    // Find related questions from the same WAC section
    const related = qa
      ? typedQAPairs
          .filter(
            (q) =>
              q.sectionId === qa.sectionId &&
              generateSlug(q.question) !== slug
          )
          .slice(0, 5)
      : []

    return { currentQA: qa, relatedQuestions: related }
  }, [slug])

  const handleSearch = (query: string) => {
    // Navigate to home with search query
    navigate(`/?q=${encodeURIComponent(query)}`)
  }

  if (!currentQA) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-6">
        <h1 className="text-2xl font-bold text-text">Question not found</h1>
        <Link
          to="/"
          className="flex items-center gap-1 text-primary-dark hover:underline"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to search
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <QuestionSEOHead
        question={currentQA.question}
        answer={currentQA.answer}
        slug={slug!}
        sectionId={currentQA.sectionId}
      />
      <FAQPageSchema question={currentQA.question} answer={currentQA.answer} />
      <Analytics />

      {/* Header */}
      <header className="max-w-lg mx-auto mb-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-primary-dark hover:underline mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-semibold">WAC Search</span>
        </Link>
      </header>

      <main className="space-y-6 max-w-lg mx-auto">
        {/* Question as H1 */}
        <h1 className="text-2xl font-bold text-text leading-tight">
          {currentQA.question}
        </h1>

        {/* Answer Card */}
        <Card className="bg-white border-l-4 border-l-secondary shadow-lg shadow-primary/10">
          <CardContent className="p-4 space-y-4">
            <div className="text-xs text-text-muted font-medium uppercase tracking-wide">
              {currentQA.sectionTitle}
            </div>

            <p className="text-text leading-relaxed text-lg">
              {currentQA.answer}
            </p>

            <a
              href={currentQA.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 hover:from-primary/30 hover:to-secondary/30 transition-colors"
            >
              <ExternalLink className="w-5 h-5 text-primary-dark" />
              <div>
                <div className="font-semibold text-primary-dark">
                  View on WAC website
                </div>
                <div className="text-sm text-text-muted">
                  WAC {currentQA.sectionId}
                </div>
              </div>
            </a>
          </CardContent>
        </Card>

        {/* Related Questions */}
        {relatedQuestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-text-muted">
              Related questions from {currentQA.sectionTitle}:
            </p>
            <div className="space-y-1">
              {relatedQuestions.map((qa) => (
                <Link
                  key={generateSlug(qa.question)}
                  to={`/q/${generateSlug(qa.question)}`}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white hover:bg-primary/5 transition-colors text-left"
                >
                  <span className="text-sm text-text pr-2">{qa.question}</span>
                  <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search Box */}
        <div className="space-y-2 pt-4">
          <p className="text-sm text-text-muted text-center">
            Ask another question
          </p>
          <SearchInput
            onSearch={handleSearch}
            placeholder="Type your question..."
          />
        </div>
      </main>

      {/* Disclaimer Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background py-4">
        <Disclaimer />
      </footer>
    </div>
  )
}
