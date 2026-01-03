import type React from "react"
interface ThemedCardProps {
  children: React.ReactNode
  className?: string
  primaryColor?: string
  variant?: "default" | "outlined" | "filled"
}

export function ThemedCard({ children, className = "", variant = "default" }: ThemedCardProps) {
  const variants = {
    default: "bg-card border border-border",
    outlined: "border-2 border-primary/20 bg-transparent",
    filled: "bg-primary/10 border border-primary/20",
  }

  return <div className={`rounded-lg p-6 ${variants[variant]} ${className}`}>{children}</div>
}
