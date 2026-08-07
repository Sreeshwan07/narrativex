import { DECK_SIZE, type DeckSlide } from "@/lib/deck/schema";
import { cn } from "@/lib/utils";

/** Renders one slide at native 1280×720 — the caller scales it with a transform. */
export function SlideCanvas({ slide }: { slide: DeckSlide }) {
  const isCover = slide.layout === "cover";
  const wideBullets = slide.bullets.length > 3;

  return (
    <div
      className="relative overflow-hidden bg-background text-foreground"
      style={{ width: DECK_SIZE.width, height: DECK_SIZE.height }}
    >
      {isCover && <span className="absolute inset-y-0 left-0 w-2.5 bg-ember" />}

      <div className={cn("flex h-full flex-col", isCover ? "px-20 py-14" : "px-20 py-12")}>
        {isCover ? (
          <div className="flex flex-1 flex-col justify-center">
            <span className="font-mono text-base uppercase tracking-[0.24em] text-ember">
              {slide.eyebrow}
            </span>
            <h2 className="mt-6 text-[5.6rem] leading-[1.02]">{slide.title}</h2>
            {slide.subtitle && (
              <p className="mt-6 max-w-3xl font-display text-[2.1rem] italic leading-snug text-ember">
                {slide.subtitle}
              </p>
            )}
            {slide.body && (
              <p className="mt-8 max-w-2xl text-xl leading-relaxed text-muted-foreground">
                {slide.body}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="border-b border-border pb-4">
              <span className="font-mono text-sm uppercase tracking-[0.24em] text-ember">
                {slide.eyebrow}
              </span>
              <h2 className="mt-3 text-[3.4rem] leading-tight">{slide.title}</h2>
            </div>

            <div className="flex flex-1 flex-col gap-7 pt-8">
              {slide.subtitle && (
                <span className="font-mono text-sm uppercase tracking-[0.2em] text-ember">
                  {slide.subtitle}
                </span>
              )}

              {slide.body && (
                <p className="max-w-4xl text-[1.6rem] leading-snug text-foreground">{slide.body}</p>
              )}

              {slide.tags.length > 0 && (
                <div className="flex flex-wrap gap-2.5">
                  {slide.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-card px-4 py-2 font-mono text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {slide.steps.length > 0 && (
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(${slide.steps.length}, minmax(0, 1fr))` }}
                >
                  {slide.steps.map((step, i) => (
                    <div
                      key={step}
                      className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-paper"
                    >
                      <span className="absolute inset-x-0 top-0 h-1 bg-ember" />
                      <span className="font-mono text-sm font-semibold text-ember">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="mt-4 text-lg leading-snug">{step}</p>
                    </div>
                  ))}
                </div>
              )}

              {slide.bullets.length > 0 && (
                <div className={cn("grid gap-x-8 gap-y-5", wideBullets && "grid-cols-2")}>
                  {slide.bullets.map((bullet) => (
                    <div key={bullet.label} className="flex gap-4">
                      <span className="mt-3 size-1.5 shrink-0 rounded-full bg-ember" />
                      <div>
                        <p className="text-[1.35rem] font-semibold leading-snug">{bullet.label}</p>
                        {bullet.detail && (
                          <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                            {bullet.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {slide.closing && (
                <p className="max-w-4xl font-display text-[1.9rem] italic leading-snug text-ember">
                  {slide.closing}
                </p>
              )}
            </div>

            {slide.note && (
              <p className="border-l-2 border-ember pl-4 text-base italic text-muted-foreground">
                {slide.note}
              </p>
            )}
          </>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Generated from your project documentation
          </span>
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            {String(slide.number).padStart(2, "0")} / 10
          </span>
        </div>
      </div>
    </div>
  );
}
