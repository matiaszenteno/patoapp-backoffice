import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildRawFidelityInvestigationPrompt,
  getFidelityStats,
  type RawFidelityRow,
  type RawFidelitySummary,
} from "../lib/benefitRawFidelity";
import { selectCls } from "../lib/styles";
import { supabase } from "../lib/supabase";
import { useIssuers } from "../lib/useIssuers";

type Page = { total: number; rows: RawFidelityRow[] };

const PAGE_SIZE = 100;
const INFORMATIONAL_VERDICTS = new Set(["not_published", "no_completed_run", "ok"]);
const VERDICTS = [
  "missing_published",
  "raw_missing",
  "absent_from_last_run",
  "raw_drift",
  "location_drift",
  "duplicate_source_urls",
  "not_published",
  "no_completed_run",
  "ok",
];
const LABELS: Record<string, string> = {
  ok: "Publicado fiel al raw",
  not_published: "Raw no publicado",
  missing_published: "Publicación esperada ausente",
  raw_missing: "Sin raw vinculado",
  no_completed_run: "Sin corrida de referencia",
  absent_from_last_run: "Ausente de la corrida de referencia",
  raw_drift: "Campos raw distintos",
  location_drift: "Direcciones distintas",
  duplicate_source_urls: "Varias URLs al mismo beneficio",
};
const PUBLICATION_STATE_LABELS: Record<string, string> = {
  pending: "Pendientes",
  needs_review: "Necesitan revisión",
  failed: "Fallidos",
  ignored: "Ignorados",
  unknown: "Sin outcome conocido",
};

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })
    : "—";
}

function Badge({ verdict }: { verdict: string }) {
  const cls = verdict === "ok"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : verdict === "not_published"
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : verdict === "no_completed_run" || verdict === "duplicate_source_urls"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {LABELS[verdict] ?? verdict}
    </span>
  );
}

function Fields({ label, fields }: { label: string; fields: string[] | null }) {
  if (!fields?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-sm text-stone-700">{fields.join(", ")}</p>
    </div>
  );
}

function Addresses({ label, addresses }: { label: string; addresses: string[] | null }) {
  if (!addresses?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-700">
        {addresses.map((address) => <li key={address}>{address}</li>)}
      </ul>
    </div>
  );
}

function Detail({ row, onClose }: { row: RawFidelityRow; onClose: () => void }) {
  const navigate = useNavigate();
  const normalizedFields = Object.entries(row.normalized_raw_fields ?? {});
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-stone-900/20" />
      <aside
        className="relative z-50 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-stone-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-stone-400">{row.issuer_slug}</p>
            <h2 className="text-base font-semibold text-stone-900">{row.merchant_name}</h2>
            <p className="text-sm text-stone-500">{row.title}</p>
            <p className="mt-1 break-all font-mono text-[11px] text-stone-400">
              {row.benefit_id ?? row.linked_benefit_id ?? row.observation_id ?? "Sin identificador"}
            </p>
          </div>
          <button className="text-sm text-stone-500 hover:text-stone-900" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
        <Badge verdict={row.verdict} />
        {row.verdict === "not_published" ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            Este raw quedó explicado por su outcome y no se considera una alerta ni entra en la medición de fidelidad.
          </div>
        ) : null}
        {row.verdict === "missing_published" ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            La corrida registró este raw como publicado, pero ya no existe una publicación activa correspondiente.
          </div>
        ) : null}
        {row.source_url_count && row.source_url_count > 1 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">
              {row.source_url_count} URLs de la corrida de referencia apuntan a este beneficio
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Usa el prompt de investigación para listar las observaciones y sus URLs.
            </p>
          </div>
        ) : null}
        {row.published_gap_fields?.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">Datos que trajo el scraper y faltan publicados</p>
            <p className="mt-1 text-sm text-amber-700">{row.published_gap_fields.join(", ")}</p>
          </div>
        ) : null}
        <Fields label="Campos distintos del raw" fields={row.raw_drift_fields} />
        {normalizedFields.length ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Valores raw normalizados</p>
            <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm text-stone-700">
              {normalizedFields.map(([field, value]) => (
                <div className="contents" key={field}>
                  <dt className="font-mono text-xs text-stone-500">{field}</dt>
                  <dd className="break-all">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        <Addresses label="Direcciones que faltan publicar" addresses={row.missing_published_addresses} />
        <Addresses label="Direcciones publicadas que sobran" addresses={row.extra_published_addresses} />
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-stone-400">Outcome en la referencia</p>
            <p>{row.publication_state ?? row.raw_status ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400">Publicación activa</p>
            <p>{row.has_active_publication ? "Sí" : "No"}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400">Visto en la referencia</p>
            <p>{formatDate(row.last_seen_at)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400">Vino en la corrida de referencia</p>
            <p>{row.came_in_last_run === null ? "No evaluable" : row.came_in_last_run ? "Sí" : "No"}</p>
            {row.last_seen_run_id ? (
              <p className="mt-1 break-all font-mono text-[10px] text-stone-400">{row.last_seen_run_id}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-stone-400">Último intento terminado</p>
            <p>{row.issuer_last_scrape_status ?? "—"}</p>
            <p className="text-xs text-stone-400">{formatDate(row.issuer_last_scrape_finished_at)}</p>
            {row.issuer_last_scrape_run_id ? (
              <p className="mt-1 break-all font-mono text-[10px] text-stone-400">{row.issuer_last_scrape_run_id}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-stone-400">Campos raw comparables</p>
            <p>{row.raw_match === null ? "No evaluable" : row.raw_match ? "Coinciden" : "Distintos"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-stone-400">Direcciones</p>
            <p>
              {row.address_match === null ? "No evaluable" : row.address_match ? "Coinciden" : "Distintas"}
              {" · "}{row.raw_address_count ?? "—"} scraper / {row.published_address_count ?? "—"} publicadas
            </p>
          </div>
        </div>
        {row.source_url ? (
          <a className="break-all text-xs text-blue-700 hover:underline" href={row.source_url} rel="noreferrer" target="_blank">
            Abrir fuente del scraper
          </a>
        ) : null}
        {row.benefit_id ? (
          <button
            className="mt-auto rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
            onClick={() => navigate(`/benefits/${row.benefit_id}`)}
            type="button"
          >
            Abrir beneficio activo
          </button>
        ) : null}
      </aside>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-400">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {note ? <p className="text-xs text-stone-500">{note}</p> : null}
    </div>
  );
}

export function SaludBeneficios() {
  const { issuers } = useIssuers();
  const [issuer, setIssuer] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [verdicts, setVerdicts] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [summary, setSummary] = useState<RawFidelitySummary | null>(null);
  const [selected, setSelected] = useState<RawFidelityRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const requestId = useRef(0);
  const stats = getFidelityStats(summary);
  const unpublishedStates = Object.entries(summary?.publication_states ?? {})
    .filter(([state, count]) => state !== "published" && count > 0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const args = {
      p_issuer_slug: issuer || null,
      p_verdicts: verdicts.length ? verdicts : null,
      p_only_issues: onlyIssues,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    };
    const [pageRes, summaryRes] = await Promise.all([
      supabase.rpc("get_benefit_scrape_reconciliation", args),
      supabase.rpc("get_benefit_scrape_reconciliation_summary", { p_issuer_slug: issuer || null }),
    ]);
    if (currentRequest !== requestId.current) return;
    if (pageRes.error || summaryRes.error) {
      setError(pageRes.error?.message ?? summaryRes.error?.message ?? "No se pudo cargar la fidelidad raw.");
    } else {
      setPage(pageRes.data as Page);
      setSummary(summaryRes.data as RawFidelitySummary);
    }
    setLoading(false);
  }, [issuer, offset, onlyIssues, verdicts]);

  useEffect(() => { void load(); }, [load]);

  const resetPage = () => {
    requestId.current += 1;
    setOffset(0);
    setSelected(null);
  };
  const toggle = (verdict: string) => {
    resetPage();
    if (INFORMATIONAL_VERDICTS.has(verdict)) setOnlyIssues(false);
    setVerdicts((current) => current.includes(verdict)
      ? current.filter((item) => item !== verdict)
      : [...current, verdict]);
  };
  const copyInvestigationPrompt = async () => {
    const prompt = buildRawFidelityInvestigationPrompt({
      issuer,
      onlyIssues,
      rows: page?.rows ?? [],
      summary,
      verdicts,
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2500);
  };

  const fidelityValue = stats.fidelityPercentage === null ? "—" : `${stats.fidelityPercentage}%`;
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Reconciliación de beneficios</h1>
            <p className="mt-0.5 text-sm text-stone-500">
              Explica cada raw observado, verifica que cada publicación activa tenga respaldo y mide la fidelidad de los outcomes publicados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {copyState === "error" ? <span className="text-xs text-red-600">No se pudo copiar</span> : null}
            <button
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              disabled={!page || loading}
              onClick={() => void copyInvestigationPrompt()}
              type="button"
            >
              {copyState === "copied" ? "Prompt copiado" : "Copiar prompt de investigación"}
            </button>
            <button
              className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              {loading ? "Cargando…" : "Refrescar"}
            </button>
          </div>
        </div>

        {summary && stats.waitingForReference > 0 ? (
          <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">
              {stats.waitingForReference} filas aún no tienen una corrida de referencia.
            </p>
            <p className="mt-1 text-amber-700">
              Falta una corrida exitosa posterior a la migración para esos emisores. Se excluyen del porcentaje hasta contar con una referencia congelada.
            </p>
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard
            label="Raws observados"
            note={summary ? `${summary.raw_published} publicados + ${summary.raw_not_published} no publicados` : undefined}
            value={summary?.raw_observed ?? "—"}
          />
          <MetricCard label="Publicaciones activas" value={summary?.total ?? "—"} />
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700">Fidelidad publicada</p>
            <p className="text-2xl font-semibold text-emerald-800">{fidelityValue}</p>
            <p className="text-xs text-emerald-700">{summary?.fidelity_matches ?? "—"} de {summary?.fidelity_comparable ?? "—"} comparables</p>
          </div>
          <MetricCard
            label="Alertas"
            note="Requieren investigación"
            value={summary?.reconciliation_issues ?? "—"}
          />
          <MetricCard
            label="Raws no publicados"
            note="Informativos, no son alertas"
            value={summary?.raw_not_published ?? "—"}
          />
          <MetricCard
            label="Gaps de publicación"
            note="Campos presentes en el raw"
            value={summary?.published_gaps ?? "—"}
          />
        </div>
        {unpublishedStates.length ? (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-md border border-sky-100 bg-sky-50/60 px-4 py-3 text-xs text-sky-800">
            <span className="font-medium">Raws no publicados por outcome:</span>
            {unpublishedStates.map(([state, count]) => (
              <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1" key={state}>
                {PUBLICATION_STATE_LABELS[state] ?? state}: {count}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            className={selectCls}
            onChange={(event) => { resetPage(); setIssuer(event.target.value); }}
            value={issuer}
          >
            <option value="">Todos los emisores</option>
            {issuers.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              checked={onlyIssues}
              className="accent-stone-900"
              onChange={(event) => { resetPage(); setOnlyIssues(event.target.checked); }}
              type="checkbox"
            />
            Solo alertas y gaps
          </label>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {VERDICTS.map((verdict) => (
            <button
              className={`rounded-full border px-3 py-1 text-xs ${verdicts.includes(verdict) ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600"}`}
              key={verdict}
              onClick={() => toggle(verdict)}
              type="button"
            >
              {LABELS[verdict] ?? verdict} {summary?.verdicts?.[verdict] ? `(${summary.verdicts[verdict]})` : ""}
            </button>
          ))}
        </div>
        {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50 text-left">
                <th className="px-4 py-3 text-xs text-stone-400">Emisor</th>
                <th className="px-4 py-3 text-xs text-stone-400">Raw / beneficio</th>
                <th className="px-4 py-3 text-xs text-stone-400">Publicación</th>
                <th className="px-4 py-3 text-xs text-stone-400">Resultado</th>
                <th className="px-4 py-3 text-xs text-stone-400">Visto en referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {page?.rows.map((row) => (
                <tr className="cursor-pointer hover:bg-stone-50" key={row.reconciliation_row_id} onClick={() => setSelected(row)}>
                  <td className="px-4 py-3 text-stone-500">{row.issuer_slug}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-800">{row.merchant_name}</p>
                    <p className="max-w-md truncate text-xs text-stone-400">{row.title}</p>
                    {row.published_gap_fields?.length ? (
                      <p className="mt-1 text-xs text-amber-700">Falta publicado: {row.published_gap_fields.join(", ")}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    <p>{row.has_active_publication ? "Activa" : "Sin publicación activa"}</p>
                    <p className="text-xs text-stone-400">Outcome: {row.publication_state}</p>
                  </td>
                  <td className="px-4 py-3"><Badge verdict={row.verdict} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">{formatDate(row.last_seen_at)}</td>
                </tr>
              ))}
              {!loading && !page?.rows.length ? (
                <tr><td className="px-4 py-8 text-center text-stone-400" colSpan={5}>Sin observaciones ni beneficios para estos filtros.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {page ? (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-stone-400">
            <p>Mostrando {page.rows.length ? offset + 1 : 0}–{offset + page.rows.length} de {page.total}.</p>
            <div className="flex gap-2">
              <button
                className="rounded border border-stone-300 bg-white px-3 py-1 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                disabled={loading || offset === 0}
                onClick={() => { setSelected(null); setOffset((current) => Math.max(0, current - PAGE_SIZE)); }}
                type="button"
              >
                Anterior
              </button>
              <button
                className="rounded border border-stone-300 bg-white px-3 py-1 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                disabled={loading || offset + page.rows.length >= page.total}
                onClick={() => { setSelected(null); setOffset((current) => current + PAGE_SIZE); }}
                type="button"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : null}
        {selected ? <Detail onClose={() => setSelected(null)} row={selected} /> : null}
      </div>
    </div>
  );
}
