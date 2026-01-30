import type { RouteRecord } from "vite-react-ssg"
import { lazy } from "react"
import App from "./App"

// Lazy load the question page component
const QuestionPage = lazy(() => import("./pages/QuestionPage"))

// Load QA pairs at build time to generate static paths
async function getQAPaths(): Promise<string[]> {
  // During build, vite-react-ssg will run this in Node.js
  // We need to fetch the QA pairs and generate slugs
  const qaPairs = await import("../public/data/qa-pairs.json").then(m => m.default)
  const { getAllSlugs } = await import("./lib/slug")
  return getAllSlugs(qaPairs).map(slug => `q/${slug}`)
}

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/q/:slug",
    element: <QuestionPage />,
    entry: "src/pages/QuestionPage.tsx",
    getStaticPaths: getQAPaths,
  },
]
