import { Plus, Trash2, RotateCcw, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/primitives";
import { EDITABLE_LAYOUTS } from "@/lib/deck/editing";
import { DEFAULT_SLIDE_FORMAT, type DeckSlide, type SlideFormat } from "@/lib/deck/schema";
import { getDeckStyle } from "@/lib/deck/styles";
import { cn } from "@/lib/utils";

type Patch = (patch: Partial<DeckSlide>) => void;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <Field label={label}>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <Button
              variant="quiet"
              size="sm"
              aria-label={`Remove ${label} item ${i + 1}`}
              className="min-h-9 min-w-9 shrink-0"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="quiet"
          size="sm"
          className="min-h-9"
          onClick={() => onChange([...items, ""])}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
    </Field>
  );
}

export function SlideInspector({
  slide,
  styleId,
  onPatch,
}: {
  slide: DeckSlide;
  styleId: string;
  onPatch: Patch;
}) {
  const format: SlideFormat = slide.format ?? DEFAULT_SLIDE_FORMAT;
  const setFormat = (patch: Partial<SlideFormat>) => onPatch({ format: { ...format, ...patch } });
  const styleBg = getDeckStyle(styleId).palette.bg;

  const toggle = (active: boolean) =>
    cn("min-h-9 min-w-9", active && "border-ember bg-ember/10 text-foreground");

  return (
    <div className="space-y-6">
      {/* Text formatting */}
      <div className="space-y-3">
        <Eyebrow>Format</Eyebrow>
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" size="sm" aria-pressed={format.bold} aria-label="Bold" className={toggle(format.bold)} onClick={() => setFormat({ bold: !format.bold })}>
            <Bold className="size-3.5" />
          </Button>
          <Button variant="quiet" size="sm" aria-pressed={format.italic} aria-label="Italic" className={toggle(format.italic)} onClick={() => setFormat({ italic: !format.italic })}>
            <Italic className="size-3.5" />
          </Button>
          <Button variant="quiet" size="sm" aria-pressed={format.underline} aria-label="Underline" className={toggle(format.underline)} onClick={() => setFormat({ underline: !format.underline })}>
            <Underline className="size-3.5" />
          </Button>
          <span className="mx-1 w-px bg-border" aria-hidden="true" />
          {([
            ["left", AlignLeft],
            ["center", AlignCenter],
            ["right", AlignRight],
          ] as const).map(([value, Icon]) => (
            <Button
              key={value}
              variant="quiet"
              size="sm"
              aria-pressed={format.align === value}
              aria-label={`Align ${value}`}
              className={toggle(format.align === value)}
              onClick={() => setFormat({ align: format.align === value ? "inherit" : value })}
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
          <Button
            variant="quiet"
            size="sm"
            className="min-h-9"
            onClick={() => setFormat({ ...DEFAULT_SLIDE_FORMAT })}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>

        <Field label={`Font size — ${Math.round(format.scale * 100)}%`}>
          <input
            type="range"
            min={70}
            max={140}
            step={5}
            value={Math.round(format.scale * 100)}
            aria-label="Font size"
            className="w-full accent-[var(--ember,currentColor)]"
            onChange={(e) => setFormat({ scale: Number(e.target.value) / 100 })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Layout">
            <select
              value={slide.layout}
              aria-label="Slide layout"
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
              onChange={(e) => onPatch({ layout: e.target.value as DeckSlide["layout"] })}
            >
              {EDITABLE_LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Background">
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Slide background colour"
                value={`#${(format.background || styleBg).replace(/^#/, "")}`}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-card"
                onChange={(e) => setFormat({ background: e.target.value.replace("#", "").toUpperCase() })}
              />
              <Button
                variant="quiet"
                size="sm"
                className="min-h-9 flex-1"
                onClick={() => setFormat({ background: "" })}
              >
                Theme
              </Button>
            </div>
          </Field>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        <Eyebrow>Content</Eyebrow>
        <Field label="Section heading">
          <Input value={slide.eyebrow} onChange={(e) => onPatch({ eyebrow: e.target.value })} />
        </Field>
        <Field label="Title">
          <Textarea rows={2} value={slide.title} onChange={(e) => onPatch({ title: e.target.value })} />
        </Field>
        <Field label="Subtitle">
          <Textarea rows={2} value={slide.subtitle} onChange={(e) => onPatch({ subtitle: e.target.value })} />
        </Field>
        <Field label="Body text">
          <Textarea rows={4} value={slide.body} onChange={(e) => onPatch({ body: e.target.value })} />
        </Field>

        {/* Bullets */}
        <Field label="Bullet points">
          <div className="space-y-3">
            {slide.bullets.map((bullet, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
                <div className="flex gap-2">
                  <Input
                    value={bullet.label}
                    placeholder="Bullet"
                    onChange={(e) =>
                      onPatch({
                        bullets: slide.bullets.map((b, j) =>
                          j === i ? { ...b, label: e.target.value } : b,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-label={`Remove bullet ${i + 1}`}
                    className="min-h-9 min-w-9 shrink-0"
                    onClick={() => onPatch({ bullets: slide.bullets.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <Input
                  value={bullet.detail}
                  placeholder="Supporting detail (optional)"
                  onChange={(e) =>
                    onPatch({
                      bullets: slide.bullets.map((b, j) =>
                        j === i ? { ...b, detail: e.target.value } : b,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <Button
              variant="quiet"
              size="sm"
              className="min-h-9"
              onClick={() => onPatch({ bullets: [...slide.bullets, { label: "", detail: "" }] })}
            >
              <Plus className="size-3.5" />
              Add bullet
            </Button>
          </div>
        </Field>

        <ListEditor
          label="Steps"
          items={slide.steps}
          placeholder="Step"
          onChange={(steps) => onPatch({ steps })}
        />
        <ListEditor
          label="Tags"
          items={slide.tags}
          placeholder="Tag"
          onChange={(tags) => onPatch({ tags })}
        />

        {slide.metrics.length > 0 && (
          <Field label="Metrics">
            <div className="space-y-3">
              {slide.metrics.map((metric, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-border p-2.5">
                  <Input
                    value={metric.value}
                    placeholder="Value"
                    onChange={(e) =>
                      onPatch({
                        metrics: slide.metrics.map((m, j) =>
                          j === i ? { ...m, value: e.target.value } : m,
                        ),
                      })
                    }
                  />
                  <Input
                    value={metric.label}
                    placeholder="Label"
                    onChange={(e) =>
                      onPatch({
                        metrics: slide.metrics.map((m, j) =>
                          j === i ? { ...m, label: e.target.value } : m,
                        ),
                      })
                    }
                  />
                  <Input
                    value={metric.detail}
                    placeholder="Detail"
                    onChange={(e) =>
                      onPatch({
                        metrics: slide.metrics.map((m, j) =>
                          j === i ? { ...m, detail: e.target.value } : m,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </Field>
        )}

        {slide.columns.length > 0 && (
          <Field label="Columns">
            <div className="space-y-3">
              {slide.columns.map((column, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
                  <Input
                    value={column.title}
                    placeholder="Column title"
                    onChange={(e) =>
                      onPatch({
                        columns: slide.columns.map((c, j) =>
                          j === i ? { ...c, title: e.target.value } : c,
                        ),
                      })
                    }
                  />
                  <Textarea
                    rows={3}
                    value={column.items.join("\n")}
                    placeholder="One item per line"
                    onChange={(e) =>
                      onPatch({
                        columns: slide.columns.map((c, j) =>
                          j === i ? { ...c, items: e.target.value.split("\n") } : c,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </Field>
        )}

        {slide.phases.length > 0 && (
          <Field label="Timeline phases">
            <div className="space-y-3">
              {slide.phases.map((phase, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-border p-2.5">
                  <Input
                    value={phase.phase}
                    placeholder="Phase"
                    onChange={(e) =>
                      onPatch({
                        phases: slide.phases.map((p, j) =>
                          j === i ? { ...p, phase: e.target.value } : p,
                        ),
                      })
                    }
                  />
                  <Input
                    value={phase.label}
                    placeholder="Label"
                    onChange={(e) =>
                      onPatch({
                        phases: slide.phases.map((p, j) =>
                          j === i ? { ...p, label: e.target.value } : p,
                        ),
                      })
                    }
                  />
                  <Input
                    value={phase.detail}
                    placeholder="Detail"
                    onChange={(e) =>
                      onPatch({
                        phases: slide.phases.map((p, j) =>
                          j === i ? { ...p, detail: e.target.value } : p,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </Field>
        )}

        <Field label="Note">
          <Textarea rows={2} value={slide.note} onChange={(e) => onPatch({ note: e.target.value })} />
        </Field>
        <Field label="Closing line">
          <Textarea rows={2} value={slide.closing} onChange={(e) => onPatch({ closing: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}
