import { useState, useCallback, useRef, useEffect } from "react"
import { isSpeechSupported, createRecognition } from "@/lib/speech"

interface UseVoiceReturn {
  isSupported: boolean
  isStarting: boolean
  isListening: boolean
  transcript: string
  error: string | null
  startListening: () => void
  stopListening: () => void
}

export function useVoice(): UseVoiceReturn {
  const [isStarting, setIsStarting] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported = isSpeechSupported()

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
    }
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition not supported")
      return
    }

    // Abort any existing recognition
    recognitionRef.current?.abort()

    setError(null)
    setTranscript("")
    setIsStarting(true)

    const recognition = createRecognition()
    if (!recognition) {
      setIsStarting(false)
      return
    }

    recognitionRef.current = recognition

    recognition.onstart = () => {
      setIsStarting(false)
      setIsListening(true)
    }

    recognition.onaudiostart = () => {
      // Audio capture has started - we're definitely listening now
      setIsStarting(false)
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      let finalTranscript = ""
      let interimTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      setTranscript(finalTranscript || interimTranscript)
    }

    recognition.onerror = (event) => {
      setIsStarting(false)
      if (event.error === "not-allowed") {
        setError("Microphone access denied")
      } else if (event.error !== "aborted") {
        setError(`Speech error: ${event.error}`)
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsStarting(false)
      setIsListening(false)
    }

    recognition.start()
  }, [isSupported])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsStarting(false)
    setIsListening(false)
  }, [])

  return {
    isSupported,
    isStarting,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  }
}
