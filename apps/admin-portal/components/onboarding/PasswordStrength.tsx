"use client";

function score(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 16) s++;
  return s;
}

const LABELS = ["", "Too weak", "Weak", "Fair", "Strong", "Very strong"] as const;
const COLORS = ["#D9D1C5", "#ba1a1a", "#C4830A", "#C4830A", "#2ABF6C", "#2ABF6C"] as const;

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const s = score(password);
  const fill = COLORS[s] ?? "#D9D1C5";
  const label = LABELS[s] ?? "";
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: "3px",
              borderRadius: "9999px",
              background: i <= s ? fill : "#D9D1C5",
              transition: "background 180ms ease",
            }}
          />
        ))}
      </div>
      {label && (
        <p
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: fill,
            marginTop: "5px",
          }}
        >
          {label}
        </p>
      )}
    </div>
  );
}
