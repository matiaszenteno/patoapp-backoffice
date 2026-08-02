import assert from "node:assert/strict";
import test from "node:test";

import { formFromDraft, type FormState } from "../src/lib/classification/draft.ts";
import {
  getPendingFields,
  getPrimaryAction,
  getReviewTask,
} from "../src/lib/classification/task.ts";

const LABELS = { channel: "Canal", image_url: "Imagen" };

function makeVals(overrides: Partial<FormState> = {}): FormState {
  return {
    ...formFromDraft({ channel: "physical", ends_at: "2026-08-31", title: "20% en Nike" }, null, null),
    ...overrides,
  };
}

test("el caso dominante es una duda sobre las reglas, no un campo faltante", () => {
  const task = getReviewTask(["needs_manual_review"], {
    "needs_review:rules_uncertain": { reason: "rules_uncertain", source: "ai" },
  });

  assert.equal(task.confirmsReview, true);
  assert.deepEqual(task.missingFields, []);
  assert.ok(task.doubtFields.includes("br_max_cap"));
  assert.equal(task.expired, false);
});

test("confirmar una duda no exige llenar nada", () => {
  const task = getReviewTask(["needs_manual_review"], {
    "needs_review:rules_uncertain": { reason: "rules_uncertain", source: "ai" },
  });
  const action = getPrimaryAction(task, makeVals(), LABELS);

  assert.equal(action.label, "Confirmar y publicar");
  assert.equal(action.disabledReason, null);
  assert.equal(action.needsConfirmation, false);
});

test("un campo faltante bloquea la publicación hasta completarlo", () => {
  const task = getReviewTask(["image_url_missing"], null);
  assert.deepEqual(task.missingFields, ["image_url"]);

  const vacio = getPrimaryAction(task, makeVals({ image_url: "" }), LABELS);
  assert.equal(vacio.disabledReason, "Completá Imagen");

  const lleno = getPrimaryAction(task, makeVals({ image_url: "https://ej.cl/a.webp" }), LABELS);
  assert.equal(lleno.disabledReason, null);
  assert.equal(lleno.label, "Guardar y publicar");
});

test("combina un campo faltante con una duda en una sola tarea", () => {
  // Caso real en producción: ["channel_missing", "needs_manual_review"].
  const task = getReviewTask(["channel_missing", "needs_manual_review"], {
    "needs_review:rules_uncertain": { reason: "rules_uncertain", source: "ai" },
  });

  assert.deepEqual(task.missingFields, ["channel"]);
  assert.equal(task.confirmsReview, true);

  const vals = makeVals({ channel: "" });
  assert.deepEqual(getPendingFields(task, vals), ["channel"]);
  assert.equal(getPrimaryAction(task, vals, LABELS).disabledReason, "Completá Canal");
  assert.equal(getPrimaryAction(task, vals, LABELS).label, "Confirmar y publicar");
});

test("un beneficio vencido exige confirmación explícita antes de publicar", () => {
  // Publicar acá expone una oferta muerta a usuarios finales de la app.
  const task = getReviewTask(["benefit_expired"], null);
  assert.equal(task.expired, true);

  const action = getPrimaryAction(task, makeVals(), LABELS);
  assert.equal(action.needsConfirmation, true);
  assert.equal(action.label, "Publicar con esta vigencia");
});

test("no deja publicar un vencido sin fecha de término", () => {
  const task = getReviewTask(["benefit_expired"], null);
  const action = getPrimaryAction(task, makeVals({ ends_at: "" }), LABELS);

  assert.equal(action.disabledReason, "Corregí la fecha de término antes de publicar");
});

test("no duplica campos cuando dos blockers apuntan al mismo", () => {
  const task = getReviewTask(["description_missing", "ai_description_missing"], null);
  assert.deepEqual(task.missingFields, ["ai_description"]);
});

test("un blocker sin campo asociado no inventa uno", () => {
  const task = getReviewTask(["semantic_vector_missing"], null);
  assert.deepEqual(task.missingFields, []);
});

test("el merchant sin resolver no se satisface con el nombre que el pipeline ya rechazó", () => {
  // merchant_id_missing significa que la resolución falló *con* ese nombre. Antes el blocker
  // no mapeaba a ningún campo: el botón quedaba habilitado, el guardado no producía ninguna
  // corrección y el raw volvía a la cola idéntico.
  const task = getReviewTask(["merchant_id_missing"], null);
  assert.deepEqual(task.missingFields, ["merchant_id"]);

  const draftVals = makeVals({ merchant_id: "", merchant_name: "nike store" });

  assert.deepEqual(getPendingFields(task, draftVals, draftVals), ["merchant_id"]);
  assert.equal(
    getPrimaryAction(task, draftVals, LABELS, draftVals).disabledReason,
    "Asigná el merchant, o corregí su nombre para que el pipeline lo resuelva",
  );

  const pineado = makeVals({ merchant_id: "1d1f", merchant_name: "Nike" });
  assert.deepEqual(getPendingFields(task, pineado, draftVals), []);

  const renombrado = makeVals({ merchant_id: "", merchant_name: "Nike Chile" });
  assert.deepEqual(getPendingFields(task, renombrado, draftVals), []);

  const vaciado = makeVals({ merchant_id: "", merchant_name: "" });
  assert.deepEqual(getPendingFields(task, vaciado, draftVals), ["merchant_id"]);
});

test("falta el nombre del merchant se resuelve escribiéndolo", () => {
  const task = getReviewTask(["merchant_name_missing"], null);
  assert.deepEqual(task.missingFields, ["merchant_name"]);

  const vacio = makeVals({ merchant_name: "" });
  assert.equal(
    getPrimaryAction(task, vacio, { merchant_name: "Nombre del merchant" }, vacio).disabledReason,
    "Completá Nombre del merchant",
  );

  const lleno = makeVals({ merchant_name: "Nike" });
  assert.deepEqual(getPendingFields(task, lleno, vacio), []);
});

test("agrupa los campos genéricos y agrega los mensajes propios de cada campo", () => {
  const task = getReviewTask(["channel_missing", "merchant_id_missing"], null);
  const draftVals = makeVals({ channel: "", merchant_id: "", merchant_name: "nike store" });

  assert.equal(
    getPrimaryAction(task, draftVals, LABELS, draftVals).disabledReason,
    "Completá Canal · Asigná el merchant, o corregí su nombre para que el pipeline lo resuelva",
  );
});
