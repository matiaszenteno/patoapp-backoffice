// Qué tiene que hacer el operador con este raw. El pipeline deja la respuesta repartida entre
// publication_blockers (qué falta) y las llaves `needs_review:<reason>` de field_provenance
// (qué quedó en duda); acá se juntan en una sola tarea con una acción primaria.

import type { FormState } from "./draft.ts";
import {
  BLOCKER_FIELD,
  getFieldsToReview,
  getReviewReasons,
  type FieldProvenance,
} from "./vocabulary.ts";

export type ReviewTask = {
  /** El pipeline pide validación humana: resolverla es lo que desbloquea la publicación. */
  confirmsReview: boolean;
  /** Campos que la IA extrajo pero no da por seguros. Prellenados y editables. */
  doubtFields: string[];
  /** La vigencia ya venció: publicar expondría una oferta muerta en la app. */
  expired: boolean;
  /** Campos vacíos que hay que completar antes de publicar. */
  missingFields: string[];
  reasons: string[];
};

export function getReviewTask(
  blockers: string[],
  provenance: Record<string, FieldProvenance> | null | undefined,
): ReviewTask {
  const reasons = getReviewReasons(provenance);
  return {
    confirmsReview: blockers.includes("needs_manual_review"),
    doubtFields: getFieldsToReview(reasons),
    expired: blockers.includes("benefit_expired"),
    missingFields: [...new Set(
      blockers.map((blocker) => BLOCKER_FIELD[blocker]).filter((field): field is string => !!field),
    )],
    reasons,
  };
}

function isFilled(vals: FormState, field: string): boolean {
  const value = vals[field as keyof FormState];
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim() !== "" : !!value;
}

/** Campos que siguen vacíos y bloquean la publicación. */
export function getPendingFields(task: ReviewTask, vals: FormState): string[] {
  return task.missingFields.filter((field) => !isFilled(vals, field));
}

export type PrimaryAction = {
  disabledReason: string | null;
  /** Publicar un beneficio vencido lo expone a usuarios finales: exige confirmación. */
  needsConfirmation: boolean;
  label: string;
};

export function getPrimaryAction(
  task: ReviewTask,
  vals: FormState,
  fieldLabels: Record<string, string>,
): PrimaryAction {
  const pending = getPendingFields(task, vals);
  const disabledReason = pending.length
    ? `Completá ${pending.map((field) => fieldLabels[field] ?? field).join(", ")}`
    : null;

  if (task.expired) {
    return {
      disabledReason: vals.ends_at.trim()
        ? disabledReason
        : "Corregí la fecha de término antes de publicar",
      label: "Publicar con esta vigencia",
      needsConfirmation: true,
    };
  }

  return {
    disabledReason,
    label: task.confirmsReview ? "Confirmar y publicar" : "Guardar y publicar",
    needsConfirmation: false,
  };
}
