export const DECK_STAGES = [
  "Understanding your project",
  "Building the investor narrative",
  "Designing the slides",
  "Preparing your deck",
  "Ready to present",
] as const;

interface AnalysisProgressProps {
  /** Index of the stage currently in flight; earlier stages render as complete. */
  stage: number;
  stages?: readonly string[];
  label?: string;
}

export function AnalysisProgress({
  stage,
  stages = DECK_STAGES,
  label = "Generating",
}: AnalysisProgressProps) {
  const pct = Math.round(((stage + 1) / stages.length) * 100);

  return (
    <section className="rounded-xl border border-border bg-card p-8 shadow-paper animate-rise">
      <div className="flex items-baseline justify-between">
        <span className="rule-label">{label}</span>
        <span className="rule-label">{pct}%</span>
      </div>

      <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full bg-ember transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-6 space-y-3">
        {stages.map((item, i) => (
          <li
            key={item}
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
            <span className="font-display text-lg">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
