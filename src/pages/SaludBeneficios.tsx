import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildRawFidelityInvestigationPrompt,
  getFidelityStats,
  type RawFidelityRow,
  type RawFidelitySummary,
} from "../lib/benefitRawFidelity";
import {
  formatScrapeAttemptStatus,
  getAddressProcessingMatch,
  getHealthIssue,
  getHealthVerdict,
  getIssueGroups,
  getMissingProcessedAddresses,
  getOverviewAnswer,
  getPublicationStateExplanation,
  getRowExplanation,
  humanizeReconciliationField,
  type IssueGroupKey,
  type ReconciliationTone,
} from "../lib/reconciliationPresentation";
import { selectCls } from "../lib/styles";
import { supabase } from "../lib/supabase";
import { useIssuers } from "../lib/useIssuers";

type Page = { total: number; rows: RawFidelityRow[] };
type ViewMode = "attention" | "explained" | "all";

const PAGE_SIZE = 100;
const PUBLICATION_STATE_ORDER = ["pending", "needs_review", "failed", "ignored", "unknown"];

const TONE_STYLES: Record<ReconciliationTone, {
  badge: string;
  border: string;
  icon: string;
  panel: string;
  text: string;
}> = {
  attention: {
    badge: "border-red-200 bg-red-50 text-red-700",
    border: "border-red-200",
    icon: "bg-red-100 text-red-700",
    panel: "bg-red-50/70",
    text: "text-red-900",
  },
  healthy: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    border: "border-emerald-200",
    icon: "bg-emerald-100 text-emerald-700",
    panel: "bg-emerald-50/70",
    text: "text-emerald-900",
  },
  neutral: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    border: "border-sky-200",
    icon: "bg-sky-100 text-sky-700",
    panel: "bg-sky-50/70",
    text: "text-sky-900",
  },
  waiting: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    border: "border-amber-200",
    icon: "bg-amber-100 text-amber-700",
    panel: "bg-amber-50/70",
    text: "text-amber-900",
  },
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function valueToText(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function StatusMark({ tone }: { tone: ReconciliationTone }) {
  const symbol = tone === "healthy" ? "✓" : tone === "attention" ? "!" : tone === "waiting" ? "…" : "i";
  return (
    <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${TONE_STYLES[tone].icon}`}>
      {symbol}
    </span>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: ReconciliationTone }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_STYLES[tone].badge}`}>
      {label}
    </span>
  );
}

function Addresses({ addresses, label }: { addresses: string[] | null; label: string }) {
  if (!addresses?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm font-medium text-stone-900">{label}</p>
      <ul className="mt-2 space-y-2 text-sm text-stone-600">
        {addresses.map((address) => (
          <li className="flex gap-2" key={address}>
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" />
            <span>{address}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ onClose, row }: { onClose: () => void; row: RawFidelityRow }) {
  const navigate = useNavigate();
  const explanation = getRowExplanation(row);
  const addressProcessingMatch = getAddressProcessingMatch(row);
  const healthIssue = getHealthIssue(row);
  const healthVerdict = getHealthVerdict(row);
  const missingProcessedAddresses = getMissingProcessedAddresses(row);
  const publicationState = getPublicationStateExplanation(row.publication_state ?? row.raw_status);
  const normalizedFields = Object.entries(row.normalized_raw_fields ?? {});
  const changedFields = Array.from(new Set([
    ...(row.raw_drift_fields ?? []),
    ...(row.published_gap_fields ?? []),
  ])).map(humanizeReconciliationField);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div aria-label="Explicación del caso" aria-modal="true" className="fixed inset-0 z-40 flex justify-end" role="dialog">
      <button aria-label="Cerrar explicación" className="absolute inset-0 cursor-default bg-stone-950/25" onClick={onClose} type="button" />
      <aside className="relative z-50 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-stone-200 bg-stone-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-400">Explicación del caso</p>
            <h2 className="mt-1 text-lg font-semibold text-stone-900">{row.merchant_name}</h2>
            <p className="mt-0.5 text-sm text-stone-500">{row.title}</p>
          </div>
          <button className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>

        <div className="space-y-5 p-6">
          <section className={`rounded-xl border p-5 ${TONE_STYLES[explanation.tone].border} ${TONE_STYLES[explanation.tone].panel}`}>
            <div className="flex items-start gap-3">
              <StatusMark tone={explanation.tone} />
              <div>
                <p className={`text-base font-semibold ${TONE_STYLES[explanation.tone].text}`}>{explanation.label}</p>
                <p className="mt-1 text-sm leading-6 text-stone-700">{explanation.description}</p>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Por qué puede estar pasando</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{explanation.cause}</p>
            </section>
            <section className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Qué conviene revisar</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{explanation.nextStep}</p>
            </section>
          </div>

          {changedFields.length ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <p className="text-sm font-medium text-amber-900">Datos involucrados en la diferencia</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {changedFields.map((field) => (
                  <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-amber-800" key={field}>{field}</span>
                ))}
              </div>
              {row.published_gap_fields?.length ? (
                <p className="mt-3 text-xs leading-5 text-amber-800">
                  Estos datos venían en el scraper, pero hoy faltan en la publicación: {row.published_gap_fields.map(humanizeReconciliationField).join(", ")}.
                </p>
              ) : null}
            </section>
          ) : null}

          {row.stale_redemption_detail_keys?.length ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              <p className="font-medium">Quedaron instrucciones antiguas en la publicación</p>
              <p className="mt-1 leading-6 text-amber-800">
                Antes venían del scraper y ya no aparecen en la corrida válida: {row.stale_redemption_detail_keys.map(humanizeReconciliationField).join(", ")}.
              </p>
            </section>
          ) : null}

          {row.location_merchant_match === false ? (
            <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-medium">Hay direcciones asociadas a otro comercio</p>
              <p className="mt-1 leading-6 text-red-800">
                {formatCount(row.mismatched_location_count ?? 0, "dirección está vinculada", "direcciones están vinculadas")} a un comercio distinto del beneficio.
              </p>
            </section>
          ) : null}

          {(row.address_processing_status || row.address_expected_count !== undefined || missingProcessedAddresses.length) ? (
            <section className={`rounded-lg border p-4 text-sm ${addressProcessingMatch === false ? "border-red-200 bg-red-50 text-red-900" : "border-stone-200 bg-white text-stone-700"}`}>
              <p className="font-medium">Estado del procesamiento de direcciones</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div><p className="text-xs text-stone-400">Estado</p><p className="mt-1">{row.address_processing_status ?? "Sin información"}</p></div>
                <div><p className="text-xs text-stone-400">Esperadas / procesadas</p><p className="mt-1">{row.address_expected_count ?? "—"} / {row.address_processed_count ?? "—"}</p></div>
                <div><p className="text-xs text-stone-400">Extracción</p><p className="mt-1">{row.address_extraction_processed === false ? "No procesada" : row.address_extraction_confidence !== null && row.address_extraction_confidence !== undefined ? `Confianza ${Math.round(row.address_extraction_confidence * 100)}%` : "Estructurada o sin dato"}</p></div>
              </div>
              {missingProcessedAddresses.length ? <Addresses addresses={missingProcessedAddresses} label="Direcciones que faltan en el procesamiento" /> : null}
            </section>
          ) : null}

          {(row.publication_blockers?.length || row.failure_stage || row.failure_code || row.failure_message) ? (
            <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-medium">Evidencia del proceso de publicación</p>
              {row.publication_blockers?.length ? <p className="mt-2">Bloqueos: {row.publication_blockers.join(", ")}</p> : null}
              {row.failure_stage || row.failure_code ? <p className="mt-2 font-mono text-xs">{row.failure_stage ?? "etapa desconocida"}{row.failure_code ? ` · ${row.failure_code}` : ""}</p> : null}
              {row.failure_message ? <p className="mt-1 leading-6">{row.failure_message}</p> : null}
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Addresses addresses={row.address_processing_status ? null : row.missing_published_addresses} label="Direcciones que entregó el scraper y faltan publicadas" />
            <Addresses addresses={row.extra_published_addresses} label="Direcciones publicadas que no venían en la corrida" />
          </div>

          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-sm font-medium text-stone-900">Evidencia usada para explicar este caso</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-stone-400">Última corrida válida</p>
                <p className="mt-1 text-sm text-stone-700">
                  {row.came_in_last_run === null
                    ? "Todavía no se puede evaluar"
                    : row.came_in_last_run
                      ? "Este beneficio sí apareció"
                      : "Este beneficio no apareció"}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">{formatDate(row.last_seen_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-400">Salud operacional</p>
                <p className="mt-1 text-sm text-stone-700">{healthVerdict}{healthIssue ? " · requiere atención" : " · neutral"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-400">Intento más reciente</p>
                <p className="mt-1 text-sm text-stone-700">{formatScrapeAttemptStatus(row.issuer_last_scrape_status)}</p>
                <p className="mt-0.5 text-xs text-stone-500">{formatDate(row.issuer_last_scrape_finished_at)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-400">Estado actual</p>
                <p className="mt-1 text-sm text-stone-700">{row.has_active_publication ? "Está publicado" : publicationState.label}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-stone-400">Direcciones</p>
                <p className="mt-1 text-sm text-stone-700">
                  {row.address_match === null
                    ? "No se pueden comparar de forma segura"
                    : row.address_match
                      ? "Coinciden"
                      : `${row.raw_address_count ?? "—"} en el scraper / ${row.published_address_count ?? "—"} publicadas`}
                </p>
              </div>
            </div>
            {row.issuer_last_scrape_status === "failed" && row.last_seen_run_id !== row.issuer_last_scrape_run_id ? (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Hubo un intento posterior que falló. Para evitar diferencias falsas, esta pantalla conserva como referencia la última corrida que sí terminó correctamente.
              </p>
            ) : null}
          </section>

          <details className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
            <summary className="cursor-pointer font-medium text-stone-700">Ver evidencia técnica</summary>
            <dl className="mt-4 grid gap-3 sm:grid-cols-[11rem,1fr]">
              <dt className="text-xs text-stone-400">Código de resultado</dt>
              <dd className="break-all font-mono text-xs">{row.verdict}</dd>
              <dt className="text-xs text-stone-400">Estado interno del proceso</dt>
              <dd className="break-all font-mono text-xs">{row.draft_status ?? row.publication_state ?? row.raw_status ?? "—"}</dd>
              <dt className="text-xs text-stone-400">ID de fila</dt>
              <dd className="break-all font-mono text-xs">{row.reconciliation_row_id}</dd>
              <dt className="text-xs text-stone-400">ID de beneficio</dt>
              <dd className="break-all font-mono text-xs">{row.benefit_id ?? row.linked_benefit_id ?? "—"}</dd>
              <dt className="text-xs text-stone-400">ID de corrida usada</dt>
              <dd className="break-all font-mono text-xs">{row.last_seen_run_id ?? "—"}</dd>
              <dt className="text-xs text-stone-400">ID del último intento</dt>
              <dd className="break-all font-mono text-xs">{row.issuer_last_scrape_run_id ?? "—"}</dd>
            </dl>
            {normalizedFields.length ? (
              <div className="mt-5 border-t border-stone-100 pt-4">
                <p className="text-xs font-medium text-stone-400">Valores normalizados entregados por el scraper</p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-[11rem,1fr]">
                  {normalizedFields.map(([field, value]) => (
                    <div className="contents" key={field}>
                      <dt className="font-mono text-xs text-stone-500">{field}</dt>
                      <dd className="break-all text-xs text-stone-700">{valueToText(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </details>

          <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-5">
            {row.source_url ? (
              <a className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100" href={row.source_url} rel="noreferrer" target="_blank">
                Abrir página de origen ↗
              </a>
            ) : null}
            {row.benefit_id ? (
              <button className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800" onClick={() => navigate(`/benefits/${row.benefit_id}`)} type="button">
                Abrir publicación actual
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Overview({ issuerName, summary }: { issuerName: string; summary: RawFidelitySummary | null }) {
  const answer = getOverviewAnswer(summary);
  const stats = getFidelityStats(summary);
  return (
    <section aria-live="polite" className={`rounded-xl border p-5 sm:p-6 ${TONE_STYLES[answer.tone].border} ${TONE_STYLES[answer.tone].panel}`}>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <StatusMark tone={answer.tone} />
            <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${TONE_STYLES[answer.tone].text}`}>
              Respuesta para {issuerName}
            </p>
          </div>
          <h2 className={`mt-3 text-xl font-semibold sm:text-2xl ${TONE_STYLES[answer.tone].text}`}>{answer.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-700">{answer.description}</p>
          <p className="mt-3 text-xs leading-5 text-stone-500">
            La comparación usa la última corrida que terminó correctamente. Un intento fallido posterior se muestra como contexto, pero no reemplaza esa referencia.
          </p>
        </div>
        <div className="min-w-48 rounded-lg border border-white/70 bg-white/80 px-5 py-4">
          <p className="text-xs font-medium text-stone-500">Publicaciones que coinciden</p>
          <p className="mt-1 text-3xl font-semibold text-stone-900">
            {stats.fidelityPercentage === null ? "Aún no medible" : `${stats.fidelityPercentage}%`}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {stats.comparable > 0
              ? `${summary?.fidelity_matches ?? 0} de ${stats.comparable} que sí se pueden comparar`
              : "Falta una corrida válida con evidencia"}
          </p>
        </div>
      </div>
    </section>
  );
}

function ReconciliationFlow({ summary }: { summary: RawFidelitySummary | null }) {
  const observed = summary?.raw_observed ?? 0;
  const published = summary?.raw_published ?? 0;
  const notPublished = summary?.raw_not_published ?? 0;
  const publishedWidth = observed ? (100 * published) / observed : 0;
  const notPublishedWidth = observed ? (100 * notPublished) / observed : 0;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="max-w-3xl">
        <h2 className="text-base font-semibold text-stone-900">Cómo se construye la respuesta</h2>
        <p className="mt-1 text-sm leading-6 text-stone-500">
          Se revisan los dos sentidos: todo lo que encontró el scraper debe quedar explicado, y todo lo que está publicado debe tener respaldo en esa corrida.
        </p>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">1 · El scraper encontró</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{summary?.raw_observed ?? "—"}</p>
          <p className="mt-1 text-sm text-stone-600">hallazgos en las últimas corridas válidas</p>
        </div>
        <div aria-hidden="true" className="hidden items-center text-xl text-stone-300 lg:flex">→</div>
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">2 · El proceso decidió qué hacer</p>
          <div aria-label={`${published} marcados como publicados y ${notPublished} no publicados`} className="mt-4 flex h-3 overflow-hidden rounded-full bg-stone-200">
            <span className="bg-stone-800" style={{ width: `${publishedWidth}%` }} />
            <span className="bg-sky-400" style={{ width: `${notPublishedWidth}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-600">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-stone-800" />{published} marcados como publicados</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />{notPublished} no publicados, con una razón</span>
          </div>
        </div>
        <div aria-hidden="true" className="hidden items-center text-xl text-stone-300 lg:flex">→</div>
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">3 · Se comparó con hoy</p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">{summary?.total ?? "—"}</p>
          <p className="mt-1 text-sm text-stone-600">publicaciones activas en el catálogo actual</p>
          <p className="mt-2 text-xs text-stone-500">{summary?.reconciliation_issues ?? "—"} necesitan explicación</p>
        </div>
      </div>
      <p className="mt-4 rounded-md bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500">
        Los números de hallazgos y publicaciones no tienen por qué ser iguales: algo puede quedar pendiente, en revisión, fallar o ignorarse; y varias páginas de origen pueden terminar en una sola publicación. Las secciones siguientes separan esas razones.
      </p>
    </section>
  );
}

function UnpublishedReasons({ summary }: { summary: RawFidelitySummary | null }) {
  const states = Object.entries(summary?.raw_not_published_breakdown ?? summary?.not_published_by_verdict ?? summary?.publication_states ?? {})
    .filter(([state, count]) => state !== "published" && count > 0)
    .sort(([left], [right]) => {
      const leftIndex = PUBLICATION_STATE_ORDER.indexOf(left);
      const rightIndex = PUBLICATION_STATE_ORDER.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <StatusMark tone="neutral" />
        <div>
          <h2 className="text-base font-semibold text-sky-950">¿Por qué el scraper encontró cosas que no están publicadas?</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-900/75">
            {summary?.raw_not_published
              ? `${formatCount(summary.raw_not_published, "hallazgo quedó", "hallazgos quedaron")} fuera del catálogo, pero el proceso de publicación registró dónde se detuvieron. Los casos en revisión o ignorados son neutrales; fallos, pendientes y casos sin explicación requieren atención.`
              : "Todo lo que encontró el scraper terminó marcado como publicado; no hay hallazgos detenidos en el proceso."}
          </p>
        </div>
      </div>
      {states.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {states.map(([state, count]) => {
            const explanation = getPublicationStateExplanation(state);
            return (
              <div className="rounded-lg border border-sky-200 bg-white p-4" key={state}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-stone-900">{explanation.label}</p>
                  <span className="text-xl font-semibold text-sky-800">{count}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-stone-500">{explanation.description}</p>
              </div>
            );
          })}
        </div>
      ) : null}
      {Object.keys(summary?.address_states ?? summary?.address_processing_states ?? {}).length ? (
        <div className="mt-5 rounded-lg border border-sky-200 bg-white p-4">
          <p className="text-sm font-medium text-stone-900">Estado de direcciones</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-600">
            {Object.entries(summary?.address_states ?? summary?.address_processing_states ?? {}).map(([state, count]) => <span className="rounded-full bg-stone-100 px-3 py-1.5" key={state}>{state}: <strong>{count}</strong></span>)}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DifferenceGroups({
  activeGroup,
  onSelect,
  summary,
}: {
  activeGroup: IssueGroupKey | null;
  onSelect: (group: IssueGroupKey) => void;
  summary: RawFidelitySummary | null;
}) {
  const groups = getIssueGroups(summary);
  const actionable = groups.filter((group) => group.key !== "waiting");
  const waiting = groups.find((group) => group.key === "waiting");
  const hasIssues = (summary?.reconciliation_issues ?? 0) > 0 || (summary?.published_gaps ?? 0) > 0;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Dónde están las diferencias que sí requieren atención</h2>
          <p className="mt-1 text-sm text-stone-500">Cada caso recibe una razón principal para que se pueda investigar sin conocer los códigos internos.</p>
        </div>
        {summary?.published_gaps ? (
          <p className="max-w-md text-xs leading-5 text-amber-700">
            {formatCount(summary.published_gaps, "publicación perdió", "publicaciones perdieron")} al menos un dato que venía en el scraper. Esa señal puede aparecer dentro de otra causa principal.
          </p>
        ) : null}
      </div>

      {hasIssues ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actionable.map((group) => {
            const selected = activeGroup === group.key;
            return (
              <button
                aria-pressed={selected}
                className={`rounded-xl border p-4 text-left transition-colors ${selected ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white hover:border-stone-400"} ${group.count === 0 ? "opacity-60" : ""}`}
                disabled={group.count === 0}
                key={group.key}
                onClick={() => onSelect(group.key)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm font-semibold ${selected ? "text-white" : "text-stone-900"}`}>{group.title}</p>
                  <span className={`text-2xl font-semibold ${selected ? "text-white" : group.count ? "text-red-700" : "text-stone-400"}`}>{group.count}</span>
                </div>
                <p className={`mt-2 text-xs leading-5 ${selected ? "text-stone-300" : "text-stone-500"}`}>{group.description}</p>
                {group.count ? <p className={`mt-3 text-xs font-medium ${selected ? "text-white" : "text-stone-700"}`}>{selected ? "Mostrando estos casos" : "Ver estos casos →"}</p> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <StatusMark tone="healthy" />
          <div>
            <p className="font-medium text-emerald-900">No hay diferencias que investigar en este alcance</p>
            <p className="mt-1 text-sm text-emerald-800">Las publicaciones comparables conservan la información entregada por el scraper.</p>
          </div>
        </div>
      )}

      {waiting?.count ? (
        <button className={`mt-3 flex w-full items-start gap-3 rounded-lg border p-4 text-left ${activeGroup === "waiting" ? "border-amber-500 bg-amber-100" : "border-amber-200 bg-amber-50 hover:border-amber-300"}`} onClick={() => onSelect("waiting")} type="button">
          <StatusMark tone="waiting" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">{formatCount(waiting.count, "caso aún no se puede comparar", "casos aún no se pueden comparar")}</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">{waiting.description} No se cuentan como diferencias ni reducen el porcentaje.</p>
          </div>
          <span className="text-xs font-medium text-amber-900">{activeGroup === "waiting" ? "Mostrando" : "Ver casos"}</span>
        </button>
      ) : null}
    </section>
  );
}

export function SaludBeneficios() {
  const { issuers } = useIssuers();
  const [issuer, setIssuer] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("attention");
  const [activeGroup, setActiveGroup] = useState<IssueGroupKey | null>(null);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [summary, setSummary] = useState<RawFidelitySummary | null>(null);
  const [selected, setSelected] = useState<RawFidelityRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const requestId = useRef(0);

  const issuerName = issuers.find((item) => item.slug === issuer)?.name ?? "todos los emisores";
  const query = useMemo(() => {
    if (activeGroup) {
      const group = getIssueGroups(null).find((item) => item.key === activeGroup);
      return { onlyIssues: false, verdicts: group?.verdicts ?? [] };
    }
    if (viewMode === "explained") return { onlyIssues: false, verdicts: ["not_published"] };
    if (viewMode === "all") return { onlyIssues: false, verdicts: [] as string[] };
    return { onlyIssues: true, verdicts: [] as string[] };
  }, [activeGroup, viewMode]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const args = {
      p_issuer_slug: issuer || null,
      p_verdicts: query.verdicts.length ? query.verdicts : null,
      p_only_issues: query.onlyIssues,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    };
    const [pageRes, summaryRes] = await Promise.all([
      supabase.rpc("get_benefit_scrape_reconciliation", args),
      supabase.rpc("get_benefit_scrape_reconciliation_summary", { p_issuer_slug: issuer || null }),
    ]);
    if (currentRequest !== requestId.current) return;
    if (pageRes.error || summaryRes.error) {
      setError(pageRes.error?.message ?? summaryRes.error?.message ?? "No se pudo comparar el catálogo con el scraper.");
    } else {
      setPage(pageRes.data as Page);
      setSummary(summaryRes.data as RawFidelitySummary);
    }
    setLoading(false);
  }, [issuer, offset, query.onlyIssues, query.verdicts]);

  useEffect(() => { void load(); }, [load]);

  const resetPage = () => {
    requestId.current += 1;
    setOffset(0);
    setPage(null);
    setSelected(null);
    setLoading(true);
  };

  const changeIssuer = (nextIssuer: string) => {
    resetPage();
    setSummary(null);
    setIssuer(nextIssuer);
  };

  const changeOffset = (nextOffset: number) => {
    requestId.current += 1;
    setPage(null);
    setSelected(null);
    setLoading(true);
    setOffset(nextOffset);
  };

  const changeView = (mode: ViewMode) => {
    resetPage();
    setActiveGroup(null);
    setViewMode(mode);
  };

  const selectGroup = (group: IssueGroupKey) => {
    resetPage();
    if (activeGroup === group) {
      setActiveGroup(null);
      setViewMode("attention");
    } else {
      setActiveGroup(group);
      setViewMode("all");
    }
  };

  const copyInvestigationPrompt = async () => {
    const prompt = buildRawFidelityInvestigationPrompt({
      issuer,
      onlyIssues: query.onlyIssues,
      rows: page?.rows ?? [],
      summary,
      verdicts: query.verdicts,
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2500);
  };

  const visibleGroup = activeGroup
    ? getIssueGroups(summary).find((group) => group.key === activeGroup)
    : null;

  return (
    <div className="h-full overflow-y-auto bg-stone-50 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Reconciliación de beneficios</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">¿Lo publicado coincide con lo que encontró el scraper?</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Esta pantalla compara el catálogo actual con la extracción automática del scraper y explica, caso por caso, por qué puede haber más elementos en un lado que en el otro.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {copyState === "error" ? <span className="text-xs text-red-600">No se pudo copiar</span> : null}
            <button className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50" disabled={!page || loading} onClick={() => void copyInvestigationPrompt()} type="button">
              {copyState === "copied" ? "Datos copiados" : "Copiar datos para investigar"}
            </button>
            <button className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50" disabled={loading} onClick={() => void load()} type="button">
              {loading ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">No se pudo cargar la comparación</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        {summary || loading ? <Overview issuerName={issuerName} summary={summary} /> : null}
        {summary ? (
          <>
            <ReconciliationFlow summary={summary} />
            <UnpublishedReasons summary={summary} />
            <DifferenceGroups activeGroup={activeGroup} onSelect={selectGroup} summary={summary} />

            <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-stone-900">Casos concretos</h2>
              <p className="mt-1 text-sm text-stone-500">Abre cualquier fila para ver qué pasó, por qué puede haber ocurrido y qué evidencia se usó.</p>
            </div>
            <select className={selectCls} onChange={(event) => changeIssuer(event.target.value)} value={issuer}>
              <option value="">Todos los emisores</option>
              {issuers.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Qué casos mostrar">
            {([
              ["attention", `Requieren atención (${summary?.reconciliation_issues ?? 0})`],
              ["explained", `No publicados, pero explicados (${summary?.raw_not_published ?? 0})`],
              ["all", "Ver todo"],
            ] as Array<[ViewMode, string]>).map(([mode, label]) => {
              const selectedMode = !activeGroup && viewMode === mode;
              return (
                <button aria-pressed={selectedMode} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selectedMode ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"}`} key={mode} onClick={() => changeView(mode)} type="button">
                  {label}
                </button>
              );
            })}
          </div>

          {visibleGroup ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm">
              <p className="text-stone-700">Mostrando sólo: <span className="font-medium text-stone-900">{visibleGroup.title}</span></p>
              <button className="text-xs font-medium text-stone-600 underline underline-offset-2" onClick={() => selectGroup(visibleGroup.key)} type="button">Quitar filtro</button>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-stone-500">Beneficio</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500">Qué pasó</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500">Estado actual</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500">Evidencia usada</th>
                  <th className="px-4 py-3"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {page?.rows.map((row) => {
                  const explanation = getRowExplanation(row);
                  const publicationState = getPublicationStateExplanation(row.publication_state ?? row.raw_status);
                  return (
                    <tr className="align-top hover:bg-stone-50/80" key={row.reconciliation_row_id}>
                      <td className="px-4 py-4">
                        <p className="text-xs text-stone-400">{row.issuer_slug}</p>
                        <p className="mt-0.5 font-medium text-stone-900">{row.merchant_name}</p>
                        <p className="mt-0.5 max-w-xs text-xs leading-5 text-stone-500">{row.title}</p>
                      </td>
                      <td className="max-w-sm px-4 py-4">
                        <StatusBadge label={explanation.label} tone={explanation.tone} />
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">{explanation.description}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-stone-700">{row.has_active_publication ? "Publicado actualmente" : publicationState.label}</p>
                        {!row.has_active_publication ? <p className="mt-1 text-xs text-stone-400">No está en el catálogo actual</p> : null}
                      </td>
                      <td className="px-4 py-4 text-xs leading-5 text-stone-500">
                        <p>{row.came_in_last_run === null ? "Sin corrida válida para comparar" : row.came_in_last_run ? "Sí apareció en la corrida válida" : "No apareció en la corrida válida"}</p>
                        <p className="mt-0.5 text-stone-400">{formatDate(row.last_seen_at)}</p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button className="whitespace-nowrap rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100" onClick={() => setSelected(row)} type="button">Ver explicación</button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && !error && !page?.rows.length ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-stone-500" colSpan={5}>
                      No hay casos para estos filtros. Prueba con “Ver todo” o cambia el emisor.
                    </td>
                  </tr>
                ) : null}
                {loading && !page ? (
                  <tr><td className="px-4 py-10 text-center text-sm text-stone-500" colSpan={5}>Cargando casos…</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {page ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
              <p>Mostrando {page.rows.length ? offset + 1 : 0}–{offset + page.rows.length} de {page.total} casos para este filtro.</p>
              <div className="flex gap-2">
                <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-stone-700 hover:bg-stone-100 disabled:opacity-50" disabled={loading || offset === 0} onClick={() => changeOffset(Math.max(0, offset - PAGE_SIZE))} type="button">Anterior</button>
                <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-stone-700 hover:bg-stone-100 disabled:opacity-50" disabled={loading || offset + page.rows.length >= page.total} onClick={() => changeOffset(offset + PAGE_SIZE)} type="button">Siguiente</button>
              </div>
            </div>
          ) : null}
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-stone-700">¿Qué significa “última corrida válida”?</summary>
                <div className="mt-3 max-w-4xl space-y-2 text-sm leading-6 text-stone-600">
                  <p>Es la última ejecución del scraper que terminó correctamente —aunque haya terminado con algunos errores aislados— y guardó una copia estable de lo que encontró.</p>
                  <p>Si hubo un intento fallido después, se informa dentro de cada caso, pero no se usa para comparar: una ejecución incompleta podría hacer parecer que faltan beneficios que en realidad nunca alcanzó a revisar.</p>
                  <p>La comparación sólo considera datos que vienen directamente del scraper. Descripciones creadas con IA, reglas internas y otros enriquecimientos no se tratan como diferencias.</p>
                </div>
              </details>
            </section>

            {selected ? <Detail onClose={() => setSelected(null)} row={selected} /> : null}
          </>
        ) : (
          <section className="rounded-xl border border-stone-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-stone-700">
              {loading ? "Cargando el desglose y las explicaciones…" : "No hay un resumen disponible para mostrar."}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {loading ? "No mostraremos conclusiones hasta tener evidencia completa." : "Usa “Actualizar” para intentar cargarlo nuevamente."}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
