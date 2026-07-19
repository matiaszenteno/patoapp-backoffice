import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCorrectionFields,
  correctionForDraft,
  formFromDraft,
  type IngestionDraft,
} from "../src/lib/classification/draft.ts";
import { getChangedCorrectionFields } from "../src/lib/correctionReprocess.ts";

function makeDraft(overrides: Partial<IngestionDraft> = {}): IngestionDraft {
  return {
    benefit_id: null,
    draft: {
      ai_description: "20% en Nike los jueves",
      benefit_rules: { days: [4], max_cap: 5000 },
      category_slug: "deporte",
      channel: "physical",
      image_url: "https://example.com/nike.webp",
      needs_review: true,
      title: "20% en Nike",
      value: 20,
      value_type: "percentage",
    },
    draft_status: "needs_review",
    field_provenance: null,
    normalized_version: "2026-07-normalizer-v3",
    publication_blockers: ["needs_manual_review"],
    raw_benefit_id: "8a10ec98-37de-45d9-9a5b-d30fe43e3162",
    run_id: null,
    schema_version: "2026-07-draft-v1",
    source_content_hash: "hash-actual",
    updated_at: "2026-07-18T10:00:00Z",
    ...overrides,
  };
}

test("confirmar sin editar nada produce exactamente la resolución de la revisión", () => {
  // Este es el caso que tenía la cola congelada: 167 raws con needs_manual_review y cero
  // correcciones guardadas, porque resolve_needs_review no tenía ningún control en la UI.
  const draft = makeDraft();
  const cf = buildCorrectionFields({
    blockers: ["needs_manual_review"],
    confirmReview: true,
    draft,
    vals: formFromDraft(draft.draft, null, null),
  });

  assert.deepEqual(cf, { needs_review: false });
});

test("la confirmación dispara un reproceso en vez de quedar en no-op", () => {
  // buildCorrectionReprocessBody devuelve null con cero campos cambiados, y el guardado
  // terminaría en "no cambió ningún campo" sin publicar nunca.
  assert.deepEqual(getChangedCorrectionFields(null, { needs_review: false }), ["needs_review"]);
});

test("no persiste como corrección un campo que sigue igual al draft", () => {
  const draft = makeDraft();
  const cf = buildCorrectionFields({
    blockers: [],
    confirmReview: false,
    draft,
    vals: formFromDraft(draft.draft, null, null),
  });

  assert.deepEqual(cf, {});
});

test("persiste sólo el campo que el operador cambió", () => {
  const draft = makeDraft();
  const vals = { ...formFromDraft(draft.draft, null, null), channel: "online" };
  const cf = buildCorrectionFields({ blockers: [], confirmReview: true, draft, vals });

  assert.deepEqual(cf, { channel: "online", needs_review: false });
});

test("mergea las reglas para no borrar llaves que el formulario no expone", () => {
  const draft = makeDraft({
    draft: {
      ...makeDraft().draft,
      benefit_rules: { days: [4], display_price: "$9.990", max_cap: 5000 },
    },
  });
  const vals = { ...formFromDraft(draft.draft, null, null), br_max_cap: "8000" };
  const cf = buildCorrectionFields({ blockers: [], confirmReview: false, draft, vals });

  assert.deepEqual(cf.benefit_rules, { days: [4], display_price: "$9.990", max_cap: 8000 });
});

test("vaciar una fecha que traía el draft es un override explícito a null", () => {
  const draft = makeDraft({ draft: { ...makeDraft().draft, ends_at: "2026-08-31" } });
  const vals = { ...formFromDraft(draft.draft, null, null), ends_at: "" };
  const cf = buildCorrectionFields({ blockers: [], confirmReview: false, draft, vals });

  assert.equal(cf.ends_at, null);
});

test("cambiar el método de canje descarta los detalles del método anterior", () => {
  const draft = makeDraft({
    draft: {
      ...makeDraft().draft,
      redemption_details: { code: "NIKE20" },
      redemption_method: "code",
    },
  });
  const vals = {
    ...formFromDraft(draft.draft, null, null),
    rd_code: "",
    rd_url: "https://example.com/qr.png",
    redemption_method: "qr",
  };
  const cf = buildCorrectionFields({ blockers: [], confirmReview: false, draft, vals });

  assert.deepEqual(cf.redemption_details, { qr_url: "https://example.com/qr.png" });
  assert.equal(cf.redemption_method, "qr");
});

test("usa la descripción de la app cuando falta la descripción cruda y ése era el bloqueo", () => {
  const draft = makeDraft({ draft: { ...makeDraft().draft, description_raw: "" } });
  const vals = formFromDraft(draft.draft, null, null);
  const cf = buildCorrectionFields({
    blockers: ["description_missing"],
    confirmReview: true,
    draft,
    vals,
  });

  assert.equal(cf.description_raw, "20% en Nike los jueves");
});

test("una corrección vigente pisa el draft al cargar el formulario", () => {
  const draft = makeDraft();
  const vals = formFromDraft(draft.draft, { channel: "online" }, "revisado a mano");

  assert.equal(vals.channel, "online");
  assert.equal(vals.title, "20% en Nike");
  assert.equal(vals.note, "revisado a mano");
});

test("descarta la corrección anclada a un raw que ya cambió, salvo los campos durables", () => {
  const draft = makeDraft();
  const stale = correctionForDraft(
    { category_slug: "moda", channel: "online" },
    "hash-viejo",
    "2026-07-draft-v1",
    draft,
  );

  assert.deepEqual(stale, { category_slug: "moda" });
});

test("conserva la corrección entera cuando el raw no cambió", () => {
  const draft = makeDraft();
  const fresh = correctionForDraft(
    { category_slug: "moda", channel: "online" },
    "hash-actual",
    "2026-07-draft-v1",
    draft,
  );

  assert.deepEqual(fresh, { category_slug: "moda", channel: "online" });
});

test("lee los días canónicos del draft como etiquetas del formulario", () => {
  const draft = makeDraft();
  const vals = formFromDraft(draft.draft, null, null);

  assert.equal(vals.br_dias_mode, "specific");
  assert.deepEqual(vals.br_dias_validos, ["jueves"]);
});
