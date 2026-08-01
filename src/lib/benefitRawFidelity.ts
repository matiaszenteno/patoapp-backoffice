export type RawFidelityRow = {
  benefit_id: string;
  issuer_slug: string;
  merchant_name: string;
  title: string;
  raw_status: string | null;
  last_seen_run_id: string | null;
  last_seen_at: string | null;
  days_since_seen: number | null;
  issuer_last_scrape_run_id: string | null;
  issuer_last_scrape_at: string | null;
  issuer_last_scrape_finished_at: string | null;
  issuer_last_scrape_status: string | null;
  came_in_last_run: boolean | null;
  raw_match: boolean | null;
  raw_drift_fields: string[] | null;
  published_gap_fields: string[] | null;
  source_url_count: number | null;
  raw_address_count: number | null;
  published_address_count: number | null;
  address_match: boolean | null;
  missing_published_addresses: string[] | null;
  extra_published_addresses: string[] | null;
  verdict: string;
};

export type RawFidelitySummary = {
  total: number;
  healthy: number;
  issues: number;
  health_percentage: number;
  present_in_last_run: number;
  raw_matches: number;
  address_matches: number;
  published_gaps: number;
  verdicts: Record<string, number>;
};

export type FidelityStats = {
  comparable: number;
  fidelityPercentage: number | null;
  waitingForReference: number;
};

export function getFidelityStats(summary: RawFidelitySummary | null): FidelityStats {
  if (!summary) return { comparable: 0, fidelityPercentage: null, waitingForReference: 0 };

  const waitingForReference = summary.verdicts.no_completed_run ?? 0;
  const comparable = Math.max(0, summary.total - waitingForReference);
  const fidelityPercentage = comparable === 0
    ? null
    : Math.round((1000 * summary.healthy) / comparable) / 10;

  return { comparable, fidelityPercentage, waitingForReference };
}

type PromptOptions = {
  issuer: string;
  onlyIssues: boolean;
  rows: RawFidelityRow[];
  summary: RawFidelitySummary | null;
  verdicts: string[];
};

export function buildRawFidelityInvestigationPrompt({
  issuer,
  onlyIssues,
  rows,
  summary,
  verdicts,
}: PromptOptions): string {
  const stats = getFidelityStats(summary);
  const issues = rows.filter((row) => row.verdict !== "ok");
  const examples = issues.slice(0, 25).map((row) => {
    const rawFields = row.raw_drift_fields?.join(", ") || "—";
    const missing = row.missing_published_addresses?.length ?? 0;
    const extra = row.extra_published_addresses?.length ?? 0;
    return [
      `benefit_id=${row.benefit_id}`,
      `issuer=${row.issuer_slug}`,
      `merchant=${row.merchant_name}`,
      `title=${row.title}`,
      `verdict=${row.verdict}`,
      `reference_observation_run_id=${row.last_seen_run_id ?? "—"}`,
      `last_attempt_run_id=${row.issuer_last_scrape_run_id ?? "—"}`,
      `last_attempt_status=${row.issuer_last_scrape_status ?? "—"}`,
      `source_url_count=${row.source_url_count ?? 0}`,
      `raw_fields=${rawFields}`,
      `locations_missing=${missing}`,
      `locations_extra=${extra}`,
    ].join(" | ");
  }).map((example) => `- ${example}`).join("\n") || "- No hay divergencias en los resultados visibles.";

  const percentage = stats.fidelityPercentage === null ? "sin evidencia comparable" : `${stats.fidelityPercentage}%`;
  return `Investiga las divergencias de fidelidad raw detectadas por benefit_scrape_reconciliation en Patoapp y arma un plan concreto para resolver o explicar cada una.

Contrato: se comparan únicamente datos que el scraper entrega directamente contra lo publicado: presencia en la corrida de referencia, title, description_raw, source_url, image_url, starts_at, ends_at y el set normalizado de direcciones. processing_status, drafts, provenance, reglas, parser, enriquecimiento e IA quedan fuera de esta métrica. Una divergencia puede ser intencional; no deshagas correcciones humanas válidas sin identificarlas y confirmarlas.

Semántica temporal: la corrida de referencia es la última corrida succeeded o succeeded_with_errors que tiene evidencia congelada. issuer_last_scrape_* describe solo el último intento terminado y puede corresponder a un intento fallido posterior; no lo uses como corrida de referencia. reference_observation_run_id identifica la referencia solo cuando el beneficio estuvo presente en ella.

Contexto del filtro: emisor=${issuer || "todos"}; solo divergencias=${onlyIssues ? "sí" : "no"}; veredictos=${verdicts.length ? verdicts.join(", ") : "todos"}.
Resumen: ${summary?.healthy ?? 0}/${stats.comparable} comparables sin divergencias (${percentage}); ${stats.waitingForReference} aún sin corrida de referencia; ${summary?.present_in_last_run ?? 0} presentes; ${summary?.raw_matches ?? 0} con campos raw iguales; ${summary?.address_matches ?? 0} con direcciones exactas.

Casos visibles:
${examples}

1. Para no_completed_run, busca la última corrida exitosa con reconciliation_frozen_at; no confundas esa referencia con el último intento terminado.
2. Para raw_missing o absent_from_last_run, identifica la corrida de referencia del emisor y explica por qué el beneficio no quedó observado allí.
3. Para raw_drift, traza solo raw_evidence contra benefits en los campos listados. Distingue defecto, corrección humana intencional y falso positivo.
4. Para location_drift, compara merchant_addresses y merchant_location_candidates del raw congelado contra benefit_locations y merchant_locations publicadas.
5. Para duplicate_source_urls, lista las observaciones del beneficio dentro de la corrida de referencia y muestra todas sus source_url.
6. Agrupa por causa raíz, cuantifica impacto y propone validaciones y criterios verificables de cierre. No ejecutes acciones mutantes sin confirmar primero el alcance.`;
}
