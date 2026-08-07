import type { Pitch } from "@/lib/pitch/schema";

function hasText(value: string) {
  return value.trim().length > 0;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!hasText(value)) return null;
  return (
    <div className="border-t border-border pt-4">
      <span className="rule-label">{label}</span>
      <p className="mt-2 leading-relaxed text-foreground">{value}</p>
    </div>
  );
}

function ListField({
  label,
  items,
  variant = "list",
}: {
  label: string;
  items: string[];
  variant?: "list" | "tags";
}) {
  if (items.length === 0) return null;
  return (
    <div className="border-t border-border pt-4">
      <span className="rule-label">{label}</span>
      {variant === "tags" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex gap-3 leading-relaxed">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-ember" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PitchIntelligence({ pitch }: { pitch: Pitch }) {
  return (
    <section className="animate-rise">
      <div className="flex items-baseline justify-between border-b border-border pb-4">
        <span className="rule-label">Step 02 — Pitch Intelligence</span>
        <span className="rule-label">Grounded in your documentation</span>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-7 shadow-paper sm:p-9">
        {hasText(pitch.project_name) && (
          <h2 className="text-4xl sm:text-5xl">{pitch.project_name}</h2>
        )}
        {hasText(pitch.tagline) && (
          <p className="mt-3 font-display text-xl italic text-ember">{pitch.tagline}</p>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Field label="Problem" value={pitch.problem} />
            <Field label="Solution" value={pitch.solution} />
            <ListField label="Target users" items={pitch.target_users} />
            <ListField label="Key features" items={pitch.key_features} />
          </div>
          <div className="space-y-6">
            <Field label="Market opportunity" value={pitch.market_opportunity} />
            <Field label="Business model" value={pitch.business_model} />
            <ListField label="Competitive advantage" items={pitch.competitive_advantage} />
            <ListField label="Technology" items={pitch.technology} variant="tags" />
            <Field label="Traction" value={pitch.traction} />
            <ListField label="Roadmap" items={pitch.roadmap} />
            <Field label="Call to action" value={pitch.call_to_action} />
          </div>
        </div>
      </div>

      {pitch.investor_questions.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-7">
          <span className="rule-label">Questions investors may ask</span>
          <ol className="mt-3 space-y-2">
            {pitch.investor_questions.map((question, i) => (
              <li key={question} className="flex gap-3 leading-relaxed">
                <span className="font-mono text-xs text-ember">{String(i + 1).padStart(2, "0")}</span>
                <span>{question}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Empty sections mean your documentation didn't provide evidence for them — nothing is
        invented.
      </p>
    </section>
  );
}
