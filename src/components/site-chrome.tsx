import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="font-display text-xl leading-none tracking-tight">PitchForge</span>
        </Link>
        <nav className="flex items-center gap-6">
          <span className="hidden rule-label sm:inline">Pay-per-generation</span>
          <Link
            to="/workspace"
            className="text-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-ember"
          >
            Workspace
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="5" className="fill-ink" />
      <path d="M7 17.5V6.5h6.2" className="stroke-ink-foreground" strokeWidth="1.8" fill="none" />
      <path d="M7 12h5" className="stroke-ink-foreground" strokeWidth="1.8" fill="none" />
      <path d="M15.5 6.5 19 12l-3.5 5.5" className="stroke-ember" strokeWidth="1.8" fill="none" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <span className="rule-label">PitchForge — {new Date().getFullYear()}</span>
        <span className="rule-label">Pay-per-generation • x402 • Algorand</span>
      </div>
    </footer>
  );
}
