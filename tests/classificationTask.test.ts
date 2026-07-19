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
