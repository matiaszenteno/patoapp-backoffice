import assert from "node:assert/strict";
import test from "node:test";

import {
  describeProvenance,
  formatConfidence,
  getFieldsToReview,
  getReviewReasons,
} from "../src/lib/classification/vocabulary.ts";

test("no inventa confianza para datos que no son inferencias", () => {
  // Que el scraper no traiga confidence es una garantía (es texto literal del emisor),
  // no un dato faltante. Mostrar un porcentaje acá sería inventarlo.
  const scraper = describeProvenance({ source: "scraper" });
  assert.equal(scraper?.label, "Del sitio del emisor");
  assert.equal(scraper?.confidence, null);
  assert.equal(scraper?.isLowConfidence, false);

  const parser = describeProvenance({ source: "deterministic_parser" });
  assert.equal(parser?.label, "Regla determinística");
  assert.equal(parser?.confidence, null);
});

test("muestra la confianza y la versión del procesador de IA", () => {
  const display = describeProvenance({
    confidence: 0.74,
    source: "ai",
    version: "2026-07-core-v11",
  });

  assert.equal(display?.label, "IA · 2026-07-core-v11");
  assert.equal(display?.confidence, "74%");
  assert.equal(display?.isLowConfidence, false);
});

test("marca como baja la confianza bajo el umbral del pipeline", () => {
  assert.equal(describeProvenance({ confidence: 0.42, source: "ai" })?.isLowConfidence, true);
  assert.equal(describeProvenance({ confidence: 0.6, source: "ai" })?.isLowConfidence, false);
});

test("distingue los tres desenlaces de la resolución de merchant", () => {
  assert.equal(
    describeProvenance({ method: "exact", source: "merchant_resolution" })?.label,
    "Match exacto de merchant",
  );

  const fuzzy = describeProvenance({
    confidence: 0.82,
    method: "fuzzy",
    source: "merchant_resolution",
  });
  assert.equal(fuzzy?.label, "Match difuso de merchant");
  assert.equal(fuzzy?.confidence, "82%");

  // Un merchant nuevo puede ser un duplicado que el fuzzy no alcanzó a pescar.
  const nuevo = describeProvenance({ method: "new_merchant", source: "merchant_resolution" });
  assert.equal(nuevo?.needsAttention, true);
});

test("lee las razones de revisión desde las llaves needs_review: de la provenance", () => {
  assert.deepEqual(
    getReviewReasons({
      "needs_review:rules_uncertain": { reason: "rules_uncertain", source: "ai" },
      title: { source: "scraper" },
    }),
    ["rules_uncertain"],
  );
  assert.deepEqual(getReviewReasons(null), []);
});

test("apunta al operador a los campos que originaron la duda", () => {
  assert.deepEqual(getFieldsToReview(["days_ambiguous"]), ["br_dias_mode", "br_dias_validos"]);
  assert.ok(getFieldsToReview(["rules_uncertain"]).includes("br_max_cap"));
  assert.deepEqual(getFieldsToReview(["value_ambiguous"]), ["value", "value_type"]);
});

test("no repite campos cuando dos razones se solapan", () => {
  const fields = getFieldsToReview(["rules_uncertain", "days_ambiguous"]);
  assert.equal(new Set(fields).size, fields.length);
});

test("una razón desconocida no rompe ni inventa campos", () => {
  assert.deepEqual(getFieldsToReview(["algo_nuevo_del_pipeline"]), []);
});

test("formatConfidence ignora valores que no son números finitos", () => {
  assert.equal(formatConfidence(null), null);
  assert.equal(formatConfidence(undefined), null);
  assert.equal(formatConfidence(Number.NaN), null);
  assert.equal(formatConfidence(0), "0%");
});
