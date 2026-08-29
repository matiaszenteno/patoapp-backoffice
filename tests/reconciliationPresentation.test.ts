import assert from "node:assert/strict";
import test from "node:test";

import type { RawFidelityRow, RawFidelitySummary } from "../src/lib/benefitRawFidelity.ts";
import {
  getIssueGroups,
  getOverviewAnswer,
  getPublicationStateExplanation,
  getRowExplanation,
  humanizeReconciliationField,
} from "../src/lib/reconciliationPresentation.ts";

const summary: RawFidelitySummary = {
  total: 88,
  healthy: 72,
  issues: 16,
  health_percentage: 81.8,
  present_in_last_run: 80,
  raw_matches: 75,
  address_matches: 74,
  published_gaps: 2,
  raw_observed: 120,
  raw_published: 90,
  raw_not_published: 30,
  fidelity_comparable: 90,
  fidelity_matches: 72,
  reconciliation_issues: 18,
  publication_states: { published: 90, pending: 4, needs_review: 8, failed: 3, ignored: 15 },
  verdicts: {
    raw_drift: 8,
    raw_missing: 2,
    absent_from_last_run: 3,
    location_drift: 4,
    duplicate_source_urls: 1,
    no_completed_run: 10,
    not_published: 30,
    ok: 72,
  },
};

const row: RawFidelityRow = {
  reconciliation_row_id: "raw:observation-1",
  observation_id: "observation-1",
  benefit_id: "benefit-1",
  linked_benefit_id: "benefit-1",
  issuer_slug: "issuer",
  merchant_name: "Merchant",
  title: "Beneficio",
  channel: "online",
  source_url: "https://example.com/benefit",
  raw_id: "raw-1",
  raw_status: "published",
  publication_state: "published",
  has_active_publication: true,
  is_raw_observation: true,
  last_seen_run_id: "reference-run",
  last_seen_at: "2026-08-01T00:00:00Z",
  days_since_seen: 0,
  issuer_last_scrape_run_id: "attempt-run",
  issuer_last_scrape_at: "2026-08-01T01:00:00Z",
  issuer_last_scrape_finished_at: "2026-08-01T01:05:00Z",
  issuer_last_scrape_status: "failed",
  came_in_last_run: true,
  fidelity_comparable: true,
  raw_match: false,
  raw_drift_fields: ["title", "redemption_details"],
  published_gap_fields: ["ends_at"],
  normalized_raw_fields: { channel: "online" },
  source_url_count: 1,
  raw_address_count: 1,
  published_address_count: 1,
  address_match: true,
  missing_published_addresses: null,
  extra_published_addresses: null,
  verdict: "raw_drift",
  is_reconciliation_issue: true,
};

test("responde la pregunta central en lenguaje directo", () => {
  assert.deepEqual(getOverviewAnswer(summary), {
    title: "Hay 18 diferencias que necesitan explicación",
    description: "72 de 90 publicaciones que se pueden comparar coinciden; 18 presentan una diferencia dentro de esa comparación. Abajo se muestra dónde están las diferencias y qué las puede explicar. Además, 10 casos todavía no tienen una corrida válida para comparar.",
    tone: "attention",
  });

  assert.equal(getOverviewAnswer({
    ...summary,
    reconciliation_issues: 0,
    published_gaps: 0,
    verdicts: { ok: 90 },
  }).tone, "healthy");
  assert.equal(getOverviewAnswer({ ...summary, fidelity_comparable: 0 }).tone, "waiting");
  assert.match(getOverviewAnswer({
    ...summary,
    reconciliation_issues: 0,
    published_gaps: 0,
    verdicts: { ok: 72, no_completed_run: 2 },
  }).title, /faltan 2 casos por medir/);
});

test("explica por qué el total de alertas puede superar la resta del porcentaje", () => {
  const answer = getOverviewAnswer({
    ...summary,
    fidelity_comparable: 82,
    fidelity_matches: 70,
    reconciliation_issues: 15,
  });

  assert.match(answer.description, /12 presentan una diferencia dentro de esa comparación/);
  assert.match(answer.description, /3 casos no entran en el porcentaje porque falta el hallazgo del scraper o la publicación activa/);
});

test("agrupa los códigos internos en causas entendibles", () => {
  const groups = getIssueGroups(summary);
  assert.equal(groups.find((group) => group.key === "content")?.count, 8);
  assert.equal(groups.find((group) => group.key === "coverage")?.count, 5);
  assert.equal(groups.find((group) => group.key === "locations")?.count, 4);
  assert.equal(groups.find((group) => group.key === "duplicates")?.count, 1);
  assert.equal(groups.find((group) => group.key === "waiting")?.count, 10);
});

test("explica por qué algo no publicado no es una diferencia", () => {
  const ignored = getRowExplanation({
    ...row,
    verdict: "not_published",
    publication_state: "ignored",
    has_active_publication: false,
    fidelity_comparable: false,
    is_reconciliation_issue: false,
  });
  assert.equal(ignored.label, "Se decidió no publicar");
  assert.match(ignored.cause, /no es una diferencia/);
  assert.match(getPublicationStateExplanation("needs_review").description, /persona/);
});

test("traduce campos técnicos dentro de las explicaciones", () => {
  const explanation = getRowExplanation(row);
  assert.match(explanation.description, /Título/);
  assert.match(explanation.description, /Instrucciones para usarlo/);
  assert.match(explanation.cause, /Fecha de término/);
  assert.equal(humanizeReconciliationField("source_url"), "Página de origen");
  assert.equal(humanizeReconciliationField("code"), "Código de descuento");
});

test("todos los resultados del contrato tienen una explicación no técnica", () => {
  const verdicts = [
    "ok",
    "not_published",
    "missing_published",
    "raw_missing",
    "absent_from_last_run",
    "raw_drift",
    "location_merchant_mismatch",
    "location_drift",
    "address_presentation_drift",
    "duplicate_source_urls",
    "no_completed_run",
  ];

  for (const verdict of verdicts) {
    const explanation = getRowExplanation({
      ...row,
      verdict,
      publication_state: verdict === "not_published" ? "pending" : "published",
    });
    assert.notEqual(explanation.label, "Necesita revisión", verdict);
    assert.ok(explanation.description.length > 20, verdict);
    assert.ok(explanation.cause.length > 20, verdict);
    assert.ok(explanation.nextStep.length > 10, verdict);
  }
});

test("prioriza los veredictos nuevos de salud y conserva neutralidad", () => {
  const neutral = getRowExplanation({ ...row, verdict: "not_published", health_verdict: "in_review", publication_explanation: "Falta confirmación del operador." });
  assert.equal(neutral.tone, "neutral");
  assert.match(neutral.description, /Falta confirmación/);

  for (const verdict of ["pipeline_failed", "pipeline_pending", "unexplained_not_published", "location_processing_gap"]) {
    const explanation = getRowExplanation({
      ...row,
      verdict,
      health_verdict: verdict,
      failure_stage: "publication",
      failure_code: "timeout",
      failure_message: "No respondió a tiempo",
      address_processing_status: "partial",
      address_expected_count: 2,
      address_processed_count: 1,
      missing_processed_addresses: ["Av. Faltante 123"],
    });
    assert.equal(explanation.tone, "attention", verdict);
    assert.ok(explanation.description.length > 20, verdict);
  }
});
