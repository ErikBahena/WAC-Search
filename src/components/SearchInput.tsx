import { useState } from "react"
import type { FormEvent } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"

interface SearchInputProps {
  onSearch: (query: string) => void
  disabled?: boolean
  placeholder?: string
}

export function SearchInput({
  onSearch,
  disabled,
  placeholder = "or type your question...",
}: SearchInputProps) {
  const [query, setQuery] = useState("")

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-md">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="bg-white border-primary/30 focus:border-primary-dark rounded-xl"
      />
      <Button
        type="submit"
        disabled={disabled || !query.trim()}
        className="bg-primary-dark hover:bg-primary-dark/90 rounded-xl px-4"
      >
        <Search className="w-5 h-5" />
      </Button>
    </form>
  )
}
