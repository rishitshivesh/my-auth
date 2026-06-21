"use client";

interface StepIndicatorProps {
  total: number;
  current: number; // 1-based
}

const mint = "#2ABF6C";
const platinum = "#D9D1C5";
const stone = "#605E5A";

export function StepIndicator({ total, current }: StepIndicatorProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0",
        marginBottom: "32px",
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div
            key={step}
            style={{ display: "flex", alignItems: "center", flex: step < total ? 1 : undefined }}
          >
            {/* Dot */}
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "9999px",
                background: active ? mint : done ? mint : "rgba(255,255,255,0.72)",
                border: `1.5px solid ${active || done ? mint : platinum}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 180ms ease, border-color 180ms ease",
              }}
            >
              {done ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l2.8 2.8L10 3" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: active ? "#fff" : stone,
                    lineHeight: 1,
                  }}
                >
                  {step}
                </span>
              )}
            </div>
            {/* Connector line */}
            {step < total && (
              <div
                style={{
                  flex: 1,
                  height: "1.5px",
                  background: done ? mint : platinum,
                  transition: "background 180ms ease",
                  margin: "0 4px",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
