interface AuthHeroProps {
  title: string
  subtitle?: string
  backgroundImage?: string
  primaryColor?: string
  /** Pre-computed background value (gradient or solid color). Overrides primaryColor if set. */
  background?: string
}

export function AuthHero({ title, subtitle, backgroundImage, primaryColor = "#6366f1", background }: AuthHeroProps) {
  return (
    <div
      className="hidden flex-col justify-between bg-cover bg-center p-8 lg:flex"
      style={{
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        background: background ?? primaryColor,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold"
          style={{ backgroundColor: primaryColor }}
        >
          SS
        </div>
        <span className="text-lg font-semibold text-white">Scrolloop Sentry</span>
      </div>
      <div>
        <h1 className="mb-4 text-4xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-lg text-white/80">{subtitle}</p>}
      </div>
    </div>
  )
}
