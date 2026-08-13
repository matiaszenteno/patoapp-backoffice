export type RawFidelityRow = {
  reconciliation_row_id: string;
  observation_id: string | null;
  benefit_id: string | null;
  linked_benefit_id: string | null;
  issuer_slug: string;
  merchant_name: string;
  title: string;
  channel: string | null;
  source_url: string | null;
  raw_id: string | null;
  raw_status: string | null;
  publication_state: string;
  has_active_publication: boolean;
  is_raw_observation: boolean;
  last_seen_run_id: string | null;
  last_seen_at: string | null;
  days_since_seen: number | null;
  issuer_last_scrape_run_id: string | null;
  issuer_last_scrape_at: string | null;
  issuer_last_scrape_finished_at: string | null;
  issuer_last_scrape_status: string | null;
  came_in_last_run: boolean | null;
  fidelity_comparable: boolean;
  raw_match: boolean | null;
  raw_drift_fields: string[] | null;
  published_gap_fields: string[] | null;
  normalized_raw_fields: Record<string, unknown> | null;
  source_url_count: number | null;
  raw_address_count: number | null;
  published_address_count: number | null;
  address_match: boolean | null;
  missing_published_addresses: string[] | null;
  extra_published_addresses: string[] | null;
  verdict: string;
  is_reconciliation_issue: boolean;
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
  raw_observed: number;
  raw_published: number;
  raw_not_published: number;
  fidelity_comparable: number;
  fidelity_matches: number;
  reconciliation_issues: number;
  publication_states: Record<string, number>;
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
  const comparable = summary.fidelity_comparable;
  const fidelityPercentage = comparable === 0
    ? null
    : Math.round((1000 * summary.fidelity_matches) / comparable) / 10;

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
  const issues = rows.filter((row) => (
    row.is_reconciliation_issue
    || row.verdict === "no_completed_run"
    || row.published_gap_fields?.length
  ));
  const examples = issues.slice(0, 25).map((row) => {
    const rawFields = row.raw_drift_fields?.join(", ") || "—";
    const missing = row.missing_published_addresses?.length ?? 0;
    const extra = row.extra_published_addresses?.length ?? 0;
    return [
      `reconciliation_row_id=${row.reconciliation_row_id}`,
      `benefit_id=${row.benefit_id ?? "—"}`,
      `linked_benefit_id=${row.linked_benefit_id ?? "—"}`,
      `source_url=${row.source_url ?? "—"}`,
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

Contrato: la vista reconcilia en ambos sentidos todos los raws observados en la última corrida exitosa con evidencia congelada y todos los beneficios activos. pending, needs_review, failed e ignored se contabilizan como not_published y no son alertas. La fidelidad se compara solo para outcomes published con publicación activa, usando los campos directos normalizados del scraper: title, description_raw, source_url, image_url, starts_at, ends_at, channel, category_slug, value_type, value, redemption_method, redemption_details y direcciones estructuradas. Si las direcciones solo se derivan desde texto, address_match es no evaluable. Reglas, IA, embeddings, drafts y provenance quedan fuera. Una divergencia puede ser intencional; no deshagas correcciones humanas válidas sin identificarla y confirmarla.

Semántica temporal: la corrida de referencia es la última corrida succeeded o succeeded_with_errors que tiene evidencia congelada. issuer_last_scrape_* describe solo el último intento terminado y puede corresponder a un intento fallido posterior; no lo uses como corrida de referencia. reference_observation_run_id identifica la referencia solo cuando el beneficio estuvo presente en ella.

Contexto del filtro: emisor=${issuer || "todos"}; solo divergencias=${onlyIssues ? "sí" : "no"}; veredictos=${verdicts.length ? verdicts.join(", ") : "todos"}.
Resumen: ${summary?.raw_observed ?? 0} raws observados (${summary?.raw_published ?? 0} publicados y ${summary?.raw_not_published ?? 0} no publicados); ${summary?.fidelity_matches ?? 0}/${stats.comparable} comparables sin divergencias (${percentage}); ${summary?.reconciliation_issues ?? 0} alertas; ${stats.waitingForReference} filas sin corrida de referencia.

Casos visibles:
${examples}

1. Para no_completed_run, busca la última corrida exitosa con reconciliation_frozen_at; no confundas esa referencia con el último intento terminado.
2. Para not_published, úsalo solo como contexto del outcome; no lo conviertas en alerta de reconciliación.
3. Para missing_published, confirma por qué un outcome published ya no tiene una publicación activa.
4. Para raw_missing o absent_from_last_run, identifica la corrida de referencia del emisor y explica por qué el beneficio no quedó observado allí.
5. Para raw_drift, traza raw_evidence normalizada contra benefits en los campos listados. Distingue defecto, corrección humana intencional y falso positivo.
6. Para location_drift, compara las direcciones estructuradas del raw congelado contra las benefit_locations propias y activas del beneficio. Si la extracción era solo desde texto, no interpretes address_match nulo como divergencia.
7. Para duplicate_source_urls, lista las observaciones del beneficio dentro de la corrida de referencia y muestra todas sus source_url.
8. Agrupa por causa raíz, cuantifica impacto y propone validaciones y criterios verificables de cierre. No ejecutes acciones mutantes sin confirmar primero el alcance.`;
}
