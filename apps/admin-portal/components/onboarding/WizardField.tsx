"use client";

const stone = "#605E5A";

interface WizardFieldProps {
  label: string;
  children: React.ReactNode;
}

export function WizardField({ label, children }: WizardFieldProps) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontFamily: "Montserrat, sans-serif",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: stone,
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputBase: React.CSSProperties = {
  width: "100%",
  borderRadius: "4px",
  padding: "11px 14px",
  fontSize: "15px",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 400,
  outline: "none",
  background: "rgba(255,255,255,0.72)",
  border: "1px solid #D9D1C5",
  color: "#1A1A1A",
  boxSizing: "border-box",
  transition: "border-color 140ms ease",
};
