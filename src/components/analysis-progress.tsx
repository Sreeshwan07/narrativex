import { useEffect, useState } from "react";

const STAGES = [
  "Reading your project…",
  "Finding the problem…",
  "Building the investor narrative…",
  "Structuring your pitch…",
];

export function AnalysisProgress() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="rounded-xl border border-border bg-card p-8 shadow-paper animate-rise">
      <span className="rule-label">Analysing</span>
      <ul className="mt-5 space-y-3">
        {STAGES.map((label, i) => (
          <li
            key={label}
            className={
              i <= stage
                ? "flex items-center gap-3 text-foreground transition-opacity duration-500"
                : "flex items-center gap-3 text-muted-foreground/50 transition-opacity duration-500"
            }
          >
            <span
              className={
                i < stage
                  ? "size-1.5 rounded-full bg-ember"
                  : i === stage
                    ? "size-1.5 animate-pulse rounded-full bg-ember"
                    : "size-1.5 rounded-full bg-border"
              }
            />
            <span className="font-display text-lg">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
