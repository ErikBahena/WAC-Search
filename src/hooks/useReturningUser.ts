import { useState, useEffect } from "react"

const STORAGE_KEY = "wac-search-visited"

export function useReturningUser() {
  const [isReturningUser, setIsReturningUser] = useState<boolean | null>(null)
  const [showFullLanding, setShowFullLanding] = useState(true)

  useEffect(() => {
    try {
      const visited = localStorage.getItem(STORAGE_KEY)
      const returning = visited === "true"
      setIsReturningUser(returning)
      setShowFullLanding(!returning)

      if (!returning) {
        localStorage.setItem(STORAGE_KEY, "true")
      }
    } catch {
      // Treat as first-time user if localStorage unavailable
      setIsReturningUser(false)
      setShowFullLanding(true)
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
