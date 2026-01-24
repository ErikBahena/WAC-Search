export function isSpeechSupported(): boolean {
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window
}

export function createRecognition(): SpeechRecognition | null {
  if (!isSpeechSupported()) return null

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new SpeechRecognition()

  recognition.continuous = false
  recognition.interimResults = true
  recognition.lang = "en-US"

  return recognition
}
