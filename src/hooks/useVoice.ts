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
    console.log("[Voice] startListening called")
    if (!isSupported) {
      setError("Speech recognition not supported")
      return
    }

    // Abort any existing recognition
    recognitionRef.current?.abort()

    setError(null)
    setTranscript("")
    setIsStarting(true)
    console.log("[Voice] calling recognition.start()")

    const recognition = createRecognition()
    if (!recognition) {
      setIsStarting(false)
      return
    }

    recognitionRef.current = recognition

    recognition.onstart = () => {
      console.log("[Voice] onstart - recognition started")
      setIsStarting(false)
      setIsListening(true)
    }

    recognition.onaudiostart = () => {
      console.log("[Voice] onaudiostart - audio capture started")
      // Audio capture has started - we're definitely listening now
      setIsStarting(false)
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      console.log("[Voice] onresult - resultIndex:", event.resultIndex, "results.length:", event.results.length)

      let finalTranscript = ""
      let interimTranscript = ""

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        console.log(`[Voice]   result[${i}]: isFinal=${result.isFinal}, transcript="${result[0].transcript}"`)
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      console.log("[Voice] finalTranscript:", finalTranscript, "interimTranscript:", interimTranscript)
      setTranscript(finalTranscript || interimTranscript)
    }

    recognition.onerror = (event) => {
      console.log("[Voice] onerror:", event.error, event.message)
      setIsStarting(false)
      if (event.error === "not-allowed") {
        setError("Microphone access denied")
      } else if (event.error !== "aborted") {
        setError(`Speech error: ${event.error}`)
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      console.log("[Voice] onend - recognition ended")
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
