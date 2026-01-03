interface BrandLogoProps {
  logoUrl?: string
  tenantName?: string
  className?: string
  href?: string
}

export function BrandLogo({ logoUrl, tenantName = "Fort Knox", className = "", href = "/" }: BrandLogoProps) {
  const content = (
    <div className={`flex items-center gap-3 ${className}`}>
      {logoUrl ? (
        <img src={logoUrl || "/placeholder.svg"} alt={tenantName} className="h-8 w-8 rounded-lg" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          {tenantName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="font-semibold text-foreground">{tenantName}</span>
    </div>
  )

  if (href) {
    return <a href={href}>{content}</a>
  }

  return content
}
