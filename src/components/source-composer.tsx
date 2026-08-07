import { useCallback, useMemo, useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SOURCE_LIMITS, countWords, type PitchSource } from "@/lib/pitch/types";

interface SourceComposerProps {
  onGenerate: (source: PitchSource) => void;
  pending?: boolean;
}

export function SourceComposer({ onGenerate, pending = false }: SourceComposerProps) {

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sizeBytes, setSizeBytes] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chars = text.length;
  const words = useMemo(() => countWords(text), [text]);
  const ready = chars >= SOURCE_LIMITS.minChars && chars <= SOURCE_LIMITS.maxChars;

  const readFile = useCallback((file: File) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!SOURCE_LIMITS.acceptedExtensions.includes(ext as never)) {
      setError(`Unsupported file. Use ${SOURCE_LIMITS.acceptedExtensions.join(", ")}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? "").slice(0, SOURCE_LIMITS.maxChars));
      setFileName(file.name);
      setSizeBytes(file.size);
      setError(null);
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
        className={cn(
          "group relative flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-8 text-center transition-all duration-300",
          dragging && "border-ember bg-surface shadow-lift",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={SOURCE_LIMITS.acceptedExtensions.join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
        />
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full bg-surface-strong transition-transform duration-300",
            dragging && "scale-110",
          )}
        >
          <UploadCloud className="size-5 text-muted-foreground" />
        </div>
        <p className="mt-4 text-base">Drop your README here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {SOURCE_LIMITS.acceptedExtensions.join(" · ")} — up to{" "}
          {SOURCE_LIMITS.maxChars.toLocaleString()} characters
        </p>
        <Button
          variant="quiet"
          size="sm"
          className="mt-5"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Browse files
        </Button>

        {fileName && (
          <div className="mt-6 flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left animate-rise">
            <FileText className="size-4 shrink-0 text-ember" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{fileName}</p>
              <p className="rule-label">
                {sizeBytes ? `${(sizeBytes / 1024).toFixed(1)} KB` : "loaded"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Remove file"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => {
                setFileName(null);
                setSizeBytes(undefined);
                setText("");
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-xl border border-border bg-card shadow-paper">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="rule-label">Paste documentation</span>
          <span className="rule-label">
            {words.toLocaleString()} words · {chars.toLocaleString()} chars
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, SOURCE_LIMITS.maxChars));
            setError(null);
            if (fileName) setFileName(null);
          }}
          spellCheck={false}
          placeholder={"# Project\n\nWhat it does, who it's for, how it works…"}
          className="min-h-64 flex-1 resize-none bg-transparent p-4 font-mono text-[0.8rem] leading-relaxed outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {error ??
              (ready
                ? "Ready to forge."
                : `At least ${SOURCE_LIMITS.minChars} characters needed.`)}
          </p>
          <Button
            variant="ink"
            disabled={!ready}
            onClick={() =>
              onGenerate({
                kind: fileName ? "file" : "paste",
                content: text,
                ...(fileName ? { fileName } : {}),
                ...(sizeBytes !== undefined ? { sizeBytes } : {}),
              })
            }

          >
            Generate Pitch Deck
          </Button>
        </div>
      </div>
    </div>
  );
}
