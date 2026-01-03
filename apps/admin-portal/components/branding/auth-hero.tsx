interface AuthHeroProps {
  title: string
  subtitle?: string
  backgroundImage?: string
  primaryColor?: string
}

export function AuthHero({ title, subtitle, backgroundImage, primaryColor = "#6366f1" }: AuthHeroProps) {
  return (
    <div
      className="hidden flex-col justify-between bg-cover bg-center p-8 lg:flex"
      style={{
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundColor: primaryColor,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold"
          style={{ backgroundColor: primaryColor }}
        >
          FK
        </div>
        <span className="text-lg font-semibold text-white">Fort Knox</span>
      </div>
      <div>
        <h1 className="mb-4 text-4xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-lg text-white/80">{subtitle}</p>}
      </div>
    </div>
  )
}
