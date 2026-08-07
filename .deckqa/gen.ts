import { buildDeck } from "@/lib/deck/build";
import { slideToOps } from "@/lib/deck/layout";
import { getDeckStyle } from "@/lib/deck/styles";
import { jsPDF } from "jspdf";
import { writeFileSync } from "fs";

const pitch: any = {
  project_name: "Halyard", tagline: "Ship data pipelines without the ops tax.",
  problem: "Data teams spend most of their week maintaining brittle ETL jobs. Failures are discovered by downstream consumers. Debugging requires deep infrastructure knowledge.",
  solution: "Halyard is a declarative pipeline runtime that compiles YAML specs into typed, observable jobs. It retries, backfills and alerts automatically.",
  target_users: ["Analytics engineers", "Platform teams", "Data-heavy startups"],
  key_features: ["Declarative specs — YAML compiled to typed DAGs", "Automatic backfills", "Column-level lineage", "Failure replay", "Warehouse-native execution", "Slack alerting"],
  market_opportunity: "Every company with a warehouse runs pipelines; the tooling remains fragmented between orchestrators and transformation tools.",
  market_data_available: false,
  business_model: "Usage-based pricing per pipeline run, with a free self-hosted tier.",
  competitive_advantage: ["Compiler-based validation before run", "No separate orchestrator required", "Open-source core"],
  technology: ["Rust", "DuckDB", "Postgres", "Kubernetes", "OpenTelemetry", "TypeScript", "gRPC"],
  traction: "", roadmap: ["Managed cloud beta", "Lineage UI", "Streaming sources", "SOC2"],
  call_to_action: "We're raising a pre-seed to take the managed runtime to GA.",
  confidence_notes: [], investor_questions: ["How defensible is the compiler approach?", "What does adoption look like today?", "Why will teams replace their orchestrator?"],
};

for (const style of ["investor-minimal","dark-tech","modern-startup","data-driven","bold-founder","editorial"] as const) {
  for (const length of ["quick","standard","deep"] as const) {
    const d = buildDeck(pitch, { style, length });
    if (length === "standard") console.log(style, length, d.slides.length, d.quality.score, d.slides.map(s=>s.layout).join(","));
    else console.log(style, length, d.slides.length);
  }
}

for (const style of ["dark-tech","editorial","data-driven","bold-founder"] as const) {
  const deck = buildDeck(pitch, { style, length: "deep" });
  const st = getDeckStyle(style);
  const doc = new jsPDF({ orientation: "landscape", unit: "px", format: [1280,720] });
  deck.slides.forEach((slide, i) => {
    if (i>0) doc.addPage([1280,720], "landscape");
    for (const op of slideToOps(slide, style)) {
      if (op.kind === "rect") {
        doc.setFillColor(`#${op.color}`);
        if (op.borderColor) { doc.setDrawColor(`#${op.borderColor}`); doc.setLineWidth(op.borderWidth ?? 1); }
        const mode = op.borderColor ? "FD" : "F";
        if (op.radius) doc.roundedRect(op.x,op.y,op.w,op.h,op.radius,op.radius,mode); else doc.rect(op.x,op.y,op.w,op.h,mode);
      } else {
        doc.setTextColor(`#${op.color}`);
        doc.setFont(st.fonts[op.font].pdf, op.italic?"italic":op.bold?"bold":"normal");
        doc.setFontSize(op.size);
        const lines = doc.splitTextToSize(op.caps?op.text.toUpperCase():op.text, op.w);
        const align = op.align ?? "left";
        const x = align==="center"?op.x+op.w/2:align==="right"?op.x+op.w:op.x;
        doc.text(lines, x, op.y+op.size, { lineHeightFactor: 1.35, baseline:"alphabetic", align });
      }
    }
  });
  writeFileSync(`/tmp/deckqa/${style}.pdf`, Buffer.from(doc.output("arraybuffer")));
}
