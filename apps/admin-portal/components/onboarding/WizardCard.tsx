"use client";

import { CSSProperties } from "react";

interface WizardCardProps {
  children: React.ReactNode;
  fading?: boolean;
}

export function WizardCard({ children, fading = false }: WizardCardProps) {
  const style: CSSProperties = {
    background: "rgba(255,255,255,0.40)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid #D9D1C5",
    borderRadius: "20px",
    padding: "40px 36px",
    boxShadow: "0 8px 32px rgba(26,25,22,0.06)",
    opacity: fading ? 0 : 1,
    transform: fading ? "translateY(8px)" : "translateY(0)",
    transition: "opacity 180ms cubic-bezier(0.4,0,0.2,1), transform 180ms cubic-bezier(0.4,0,0.2,1)",
  };

  return <div style={style}>{children}</div>;
}
