"use client"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"


interface CountrySelectorProps {
  onSelect?: (country: string) => void
}

const countries = [
  "United States",
  "Canada",
  "United Kingdom",
  "Germany",
  "France",
  "Spain",
  "Australia",
  "Japan",
  "Singapore",
  "India",
]

export function CountrySelector({ onSelect }: CountrySelectorProps) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = countries.filter((c) => c.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search country..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4"
      />
      <div className="grid gap-2 max-h-72 overflow-y-auto">
        {filtered.map((country) => (
          <button
            key={country}
            onClick={() => setSelected(country)}
            className={`rounded-lg border-2 p-3 text-left transition-colors ${
              selected === country
                ? "border-primary bg-primary/5 text-foreground font-medium"
                : "border-border bg-card text-foreground hover:border-border/50"
            }`}
          >
            {country}
          </button>
        ))}
      </div>
      <Button className="w-full" onClick={() => onSelect?.(selected || "")} disabled={!selected}>
        Continue
      </Button>
    </div>
  )
}
