import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { inputCls } from "../lib/styles";
import { useIssuers } from "../lib/useIssuers";

// ─── Types ──────────────────────────────────────────────────────────────────

type ScraperRun = {
  id: string;
  issuer_slug: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  items_found: number | null;
  items_inserted: number | null;
  error: string | null;
};

type ProcessingEvent = {
  id: string;
  raw_benefit_id: string | null;
  benefit_id: string | null;
  run_id: string | null;
  stage: string;
  processor: string;
  status: string;
  processor_version: string | null;
  input_payload: unknown;
  output_payload: unknown;
  provider: string | null;
  model: string | null;
  confidence: number | null;
  error: string | null;
  created_at: string;
};

type Origin = "scraper" | "pipeline";
type Severity = "ok" | "warning" | "error" | "running";

type LogEntry = {
  id: string;
  timestamp: string;
  origin: Origin;
  type: string;
  severity: Severity;
  summary: string;
  raw: ScraperRun | ProcessingEvent;
};

// ─── Constantes y helpers ─────────────────────────────────────────────────────

const LIMIT = 500;

const ORIGIN_LABELS: Record<Origin, string> = {
  scraper: "Scraper",
  pipeline: "Pipeline",
};

const STAGE_LABELS: Record<string, string> = {
  normalization: "Normalización",
  enrichment: "Enriquecimiento",
  embedding: "Embedding",
  publication: "Publicación",
};

const SEVERITY_BADGE: Record<Severity, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warning: { label: "Aviso", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  error: { label: "Error", cls: "bg-red-50 text-red-700 border-red-200" },
  running: { label: "En curso", cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

function scraperSeverity(status: string): Severity {
  if (status === "failed") return "error";
  if (status === "running") return "running";
  return "ok"; // succeeded y cualquier otro
}

function pipelineSeverity(status: string): Severity {
  if (status === "failed") return "error";
  if (status === "needs_review") return "warning";
  return "ok"; // completed, skipped y cualquier otro
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "medium" });
}

// Formato YYYY-MM-DDTHH:mm para <input type="datetime-local">
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeRun(run: ScraperRun, issuerName: (slug: string) => string): LogEntry {
  const severity = scraperSeverity(run.status);
  const summary =
    severity === "error" && run.error
      ? run.error
      : `${issuerName(run.issuer_slug)}: ${run.items_inserted ?? 0}/${run.items_found ?? 0} guardados`;
  return {
    id: `run:${run.id}`,
    timestamp: run.started_at,
    origin: "scraper",
    type: "Extracción",
    severity,
    summary,
    raw: run,
  };
}

function normalizeEvent(event: ProcessingEvent): LogEntry {
  const severity = pipelineSeverity(event.status);
  const ref = event.raw_benefit_id ? ` · ${event.raw_benefit_id.slice(0, 8)}` : "";
  return {
    id: `event:${event.id}`,
    timestamp: event.created_at,
    origin: "pipeline",
    type: STAGE_LABELS[event.stage] ?? event.stage,
    severity,
    summary: `${event.processor}${ref}`,
    raw: event,
  };
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const { label, cls } = SEVERITY_BADGE[severity];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium border ${cls}`}>{label}</span>;
}

const ALL_ORIGINS: Origin[] = ["scraper", "pipeline"];
const ALL_SEVERITIES: Severity[] = ["ok", "warning", "error", "running"];
const ALL_STAGES = ["normalization", "enrichment", "embedding", "publication"];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-200 bg-white text-stone-500 hover:border-stone-400"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function Logs() {
  const { issuers } = useIssuers();
  const issuerName = useCallback(
    (slug: string) => issuers.find((i) => i.slug === slug)?.name ?? slug,
    [issuers],
  );

  const [from, setFrom] = useState(() =>
    toLocalInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  );
  const [to, setTo] = useState(() => toLocalInputValue(new Date()));

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const [origins, setOrigins] = useState<Origin[]>(ALL_ORIGINS);
  const [severities, setSeverities] = useState<Severity[]>(ALL_SEVERITIES);
  const [stages, setStages] = useState<string[]>(ALL_STAGES);

  const visible = useMemo(() => {
    // Si todas las etapas están seleccionadas, no filtramos por etapa (también deja
    // pasar etapas desconocidas que no estén en ALL_STAGES).
    const allStagesSelected = stages.length === ALL_STAGES.length;
    return entries.filter((e) => {
      if (!origins.includes(e.origin)) return false;
      if (!severities.includes(e.severity)) return false;
      if (e.origin === "pipeline" && !allStagesSelected) {
        return stages.includes((e.raw as ProcessingEvent).stage);
      }
      return true;
    });
  }, [entries, origins, severities, stages]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();

    const [runsRes, eventsRes] = await Promise.all([
      supabase
        .from("scraper_runs")
        .select(
          "id, issuer_slug, status, started_at, finished_at, items_found, items_inserted, error",
        )
        .gte("started_at", fromIso)
        .lte("started_at", toIso)
        .order("started_at", { ascending: false })
        .limit(LIMIT),
      supabase
        .from("benefit_processing_events")
        .select(
          "id, raw_benefit_id, benefit_id, run_id, stage, processor, status, processor_version, input_payload, output_payload, provider, model, confidence, error, created_at",
        )
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
    ]);

    const errors: string[] = [];
    if (runsRes.error) errors.push(`Scrapers: ${runsRes.error.message}`);
    if (eventsRes.error) errors.push(`Pipeline: ${eventsRes.error.message}`);
    setError(errors.length ? errors.join(" · ") : null);

    const runs = (runsRes.data as ScraperRun[] | null) ?? [];
    const events = (eventsRes.data as ProcessingEvent[] | null) ?? [];
    setTruncated(runs.length >= LIMIT || events.length >= LIMIT);

    const merged: LogEntry[] = [
      ...runs.map((r) => normalizeRun(r, issuerName)),
      ...events.map(normalizeEvent),
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    setEntries(merged);
    setLoading(false);
  }, [from, to, issuerName]);

  useEffect(() => {
    void load();
    // Solo al montar; el resto de recargas son por el botón Refrescar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-stone-900">Logs</h1>
        <p className="mt-0.5 text-sm text-stone-400">Eventos de scrapers y pipeline.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Desde</label>
          <input
            className={inputCls}
            onChange={(e) => setFrom(e.target.value)}
            type="datetime-local"
            value={from}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Hasta</label>
          <input
            className={inputCls}
            onChange={(e) => setTo(e.target.value)}
            type="datetime-local"
            value={to}
          />
        </div>
        <button
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          {loading ? "Cargando…" : "Refrescar"}
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Origen</span>
          {ALL_ORIGINS.map((o) => (
            <FilterChip active={origins.includes(o)} key={o} onClick={() => setOrigins((s) => toggle(s, o))}>
              {ORIGIN_LABELS[o]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Severidad</span>
          {ALL_SEVERITIES.map((sev) => (
            <FilterChip active={severities.includes(sev)} key={sev} onClick={() => setSeverities((s) => toggle(s, sev))}>
              {SEVERITY_BADGE[sev].label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">Etapa (pipeline)</span>
          {ALL_STAGES.map((st) => (
            <FilterChip active={stages.includes(st)} key={st} onClick={() => setStages((s) => toggle(s, st))}>
              {STAGE_LABELS[st] ?? st}
            </FilterChip>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {truncated && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Resultados truncados ({LIMIT} por fuente). Acota el rango de fechas para ver menos.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Hora</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Origen</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Tipo</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Estado</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Resumen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visible.length === 0 && !loading && (
              <tr>
                <td className="px-4 py-6 text-center text-stone-400" colSpan={5}>
                  {entries.length === 0
                    ? "Sin eventos en el rango seleccionado."
                    : "Sin eventos que coincidan con los filtros."}
                </td>
              </tr>
            )}
            {visible.map((entry) => (
              <tr key={entry.id} className="hover:bg-stone-50">
                <td className="px-4 py-3 whitespace-nowrap text-stone-400">{formatDateTime(entry.timestamp)}</td>
                <td className="px-4 py-3 text-stone-500">{ORIGIN_LABELS[entry.origin]}</td>
                <td className="px-4 py-3 text-stone-700">{entry.type}</td>
                <td className="px-4 py-3"><SeverityBadge severity={entry.severity} /></td>
                <td className="px-4 py-3 text-stone-600">{entry.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
