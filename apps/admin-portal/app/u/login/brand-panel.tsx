'use client';

interface BrandPanelProps {
  primaryColor?: string | null;
}

export function BrandPanel({ primaryColor }: BrandPanelProps) {
  const accent = primaryColor ?? '#2ABF6C';
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 100%)`,
        borderLeft: `1px solid ${accent}20`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        gap: '1.5rem',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '20px',
          background: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 8px 32px ${accent}40`,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" fill="white" fillOpacity="0.9" />
          <path d="M16 10L22 13V19L16 22L10 19V13L16 10Z" fill="white" fillOpacity="0.4" />
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 300, fontSize: '20px', color: '#1A1916', margin: 0 }}>
          Scrolloop Sentry
        </p>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: '#8A8784', margin: '6px 0 0' }}>
          Enterprise authentication platform
        </p>
      </div>
    </div>
  );
}
