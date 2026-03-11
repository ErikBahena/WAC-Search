import { useState, useEffect } from "react"

const STORAGE_KEY = "wac-search-visited"

function readReturningUser(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export function useReturningUser() {
  const [isReturningUser] = useState<boolean>(() => readReturningUser())
  const [showFullLanding, setShowFullLanding] = useState(() => !readReturningUser())

  useEffect(() => {
    try {
      if (!isReturningUser) {
        localStorage.setItem(STORAGE_KEY, "true")
      }
    } catch {
      // Ignore storage failures and keep derived defaults.
    }
  }, [isReturningUser])

  const revealFullLanding = () => {
    setShowFullLanding(true)
  }

  return {
    isReturningUser,
    showFullLanding,
    revealFullLanding,
  }
}
