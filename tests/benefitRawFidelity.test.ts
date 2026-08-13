import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRawFidelityInvestigationPrompt,
  getFidelityStats,
  type RawFidelityRow,
  type RawFidelitySummary,
} from "../src/lib/benefitRawFidelity.ts";

const summary: RawFidelitySummary = {
  total: 100,
  healthy: 72,
  issues: 28,
  health_percentage: 72,
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
  publication_states: { published: 90, needs_review: 20, failed: 10 },
  verdicts: { no_completed_run: 10, ok: 72, raw_drift: 18 },
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
  issuer_last_scrape_run_id: "failed-attempt",
  issuer_last_scrape_at: "2026-08-01T01:00:00Z",
  issuer_last_scrape_finished_at: "2026-08-01T01:05:00Z",
  issuer_last_scrape_status: "failed",
  came_in_last_run: true,
  fidelity_comparable: true,
  raw_match: false,
  raw_drift_fields: ["title"],
  published_gap_fields: null,
  normalized_raw_fields: { channel: "online" },
  source_url_count: 2,
  raw_address_count: 1,
  published_address_count: 1,
  address_match: true,
  missing_published_addresses: null,
  extra_published_addresses: null,
  verdict: "raw_drift",
  is_reconciliation_issue: true,
};

test("excluye de la fidelidad los beneficios que aún no tienen corrida de referencia", () => {
  assert.deepEqual(getFidelityStats(summary), {
    comparable: 90,
    fidelityPercentage: 80,
    waitingForReference: 10,
  });
});

test("no presenta 0% cuando todavía no existe evidencia comparable", () => {
  assert.deepEqual(getFidelityStats({
    ...summary,
    healthy: 0,
    fidelity_comparable: 0,
    fidelity_matches: 0,
    verdicts: { no_completed_run: 100 },
  }), {
    comparable: 0,
    fidelityPercentage: null,
    waitingForReference: 100,
  });
});

test("el prompt distingue la referencia del último intento y entrega IDs estables", () => {
  const prompt = buildRawFidelityInvestigationPrompt({
    issuer: "issuer",
    onlyIssues: true,
    rows: [row],
    summary,
    verdicts: ["raw_drift"],
  });

  assert.match(prompt, /reference_observation_run_id=reference-run/);
  assert.match(prompt, /last_attempt_run_id=failed-attempt/);
  assert.match(prompt, /last_attempt_status=failed/);
  assert.match(prompt, /benefit_id=benefit-1/);
  assert.match(prompt, /source_url_count=2/);
  assert.match(prompt, /última corrida succeeded o succeeded_with_errors/);
  assert.match(prompt, /no deshagas correcciones humanas válidas/);
});
