"use client";

import { ShieldCheck } from "lucide-react";

// Stitch "Titanium & Mint" tokens
const T = {
  editorial: "#1A1916",
  mint: "#2ABF6C",
  mintSoft: "rgba(42,191,108,0.10)",
  stone: "#605E5A",
} as const;

interface WizardLayoutProps {
  leftTitle: string;
  leftTagline: string;
  leftFeatures: string[];
  children: React.ReactNode;
}

export function WizardLayout({
  leftTitle,
  leftTagline,
  leftFeatures,
  children,
}: WizardLayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "#F7F6F4",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {/* Editorial dark panel */}
      <div
        className="wizard-left-panel"
        style={{
          display: "none",
          width: "42%",
          background: T.editorial,
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 52px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 55% 45% at 15% 85%, rgba(42,191,108,0.07) 0%, transparent 70%)",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "60px",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "4px",
                background: T.mintSoft,
                border: "1px solid rgba(42,191,108,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck
                style={{ width: "16px", height: "16px", color: T.mint }}
                strokeWidth={1.75}
              />
            </div>
            <span
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "15px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.90)",
                letterSpacing: "-0.01em",
              }}
            >
              Scrolloop{" "}
              <span style={{ color: T.mint }}>Sentry</span>
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: "44px" }}>
            <h1
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontSize: "34px",
                fontWeight: 300,
                lineHeight: 1.18,
                color: "rgba(255,255,255,0.93)",
                letterSpacing: "-0.02em",
                marginBottom: "14px",
                whiteSpace: "pre-line",
              }}
            >
              {leftTitle}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.40)",
                lineHeight: 1.7,
                maxWidth: "290px",
              }}
            >
              {leftTagline}
            </p>
          </div>

          {/* Feature bullets */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {leftFeatures.map((f) => (
              <div
                key={f}
                style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "9999px",
                    background: T.mintSoft,
                    border: "1px solid rgba(42,191,108,0.28)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  <div
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "9999px",
                      background: T.mint,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.50)",
                    lineHeight: 1.55,
                  }}
                >
                  {f}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "Montserrat, sans-serif",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.18)",
          }}
        >
          Scrolloop Sentry
        </p>
      </div>

      {/* Right content slot */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "420px" }}>{children}</div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .wizard-left-panel {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
