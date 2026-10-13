// Qué tiene que hacer el operador con este raw. El pipeline deja la respuesta repartida entre
// publication_blockers (qué falta) y las llaves `needs_review:<reason>` de field_provenance
// (qué quedó en duda); acá se juntan en una sola tarea con una acción primaria.

import type { FormState } from "./draft.ts";
import {
  BLOCKER_FIELD,
  BLOCKER_REVIEW_FIELDS,
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
  /** La vigencia es imposible o está invertida y debe corregirse o vaciarse explícitamente. */
  validityInvalid: boolean;
  /** Campos vacíos que hay que completar antes de publicar. */
  missingFields: string[];
  reasons: string[];
};

export function getReviewTask(
  blockers: string[],
  provenance: Record<string, FieldProvenance> | null | undefined,
): ReviewTask {
  const reasons = getReviewReasons(provenance);
  const validityInvalid = blockers.includes("validity_invalid")
    || reasons.includes("validity_invalid");
  return {
    confirmsReview: blockers.includes("needs_manual_review"),
    doubtFields: [...new Set([
      ...getFieldsToReview(reasons),
      ...blockers.flatMap((blocker) => BLOCKER_REVIEW_FIELDS[blocker] ?? []),
    ])],
    expired: blockers.includes("benefit_expired"),
    missingFields: [...new Set(
      blockers.map((blocker) => BLOCKER_FIELD[blocker]).filter((field): field is string => !!field),
    )],
    reasons,
    validityInvalid,
  };
}

function isFilled(vals: FormState, field: string): boolean {
  const value = vals[field as keyof FormState];
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim() !== "" : !!value;
}

/** Blockers que no se resuelven llenando un campo vacío, porque el campo puede venir con
 *  valor y aun así estar mal. `merchant_id_missing` es el caso: el pipeline no logró resolver
 *  el comercio, y la salida es pinear un merchant existente o corregir el nombre — que
 *  normalmente ya trae algo — para que lo vuelva a resolver. Sin esta excepción el blocker
 *  quedaría satisfecho por el nombre que el pipeline ya rechazó, el guardado no produciría
 *  ninguna corrección y el raw se quedaría en la cola para siempre. */
function isMerchantResolved(vals: FormState, draftVals: FormState | undefined): boolean {
  if (vals.merchant_id.trim()) return true;
  if (!draftVals) return false;
  return vals.merchant_name.trim() !== draftVals.merchant_name.trim()
    && vals.merchant_name.trim() !== "";
}

/** Campos que siguen sin resolver y bloquean la publicación.
 *
 *  `draftVals` es el formulario tal como lo dejó el draft, sin correcciones: sirve para
 *  distinguir "el operador cambió esto" de "esto ya venía así". */
export function getPendingFields(
  task: ReviewTask,
  vals: FormState,
  draftVals?: FormState,
): string[] {
  return task.missingFields.filter((field) => (
    field === "merchant_id" ? !isMerchantResolved(vals, draftVals) : !isFilled(vals, field)
  ));
}

/** Mensajes para campos donde "Completá X" no describe la salida real. */
const PENDING_MESSAGES: Record<string, string> = {
  merchant_id: "Asigná el merchant, o corregí su nombre para que el pipeline lo resuelva",
};

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
  draftVals?: FormState,
): PrimaryAction {
  const pending = getPendingFields(task, vals, draftVals);
  const generic = pending.filter((field) => !PENDING_MESSAGES[field]);
  const reasons = [
    ...(generic.length
      ? [`Completá ${generic.map((field) => fieldLabels[field] ?? field).join(", ")}`]
      : []),
    ...pending.map((field) => PENDING_MESSAGES[field]).filter(Boolean),
  ];
  const disabledReason = reasons.length ? reasons.join(" · ") : null;

  if (task.expired) {
    return {
      disabledReason: vals.ends_at.trim()
        ? disabledReason
        : "Corregí la fecha de término antes de publicar",
      label: "Publicar con esta vigencia",
      needsConfirmation: true,
    };
  }

  if (
    task.validityInvalid
    && vals.starts_at.trim()
    && vals.ends_at.trim()
    && vals.starts_at > vals.ends_at
  ) {
    return {
      disabledReason: "La fecha de inicio no puede ser posterior a la fecha de término",
      label: "Corregir vigencia y publicar",
      needsConfirmation: false,
    };
  }

  if (task.validityInvalid) {
    return {
      disabledReason,
      label: "Corregir vigencia y publicar",
      needsConfirmation: false,
    };
  }

  return {
    disabledReason,
    label: task.confirmsReview ? "Confirmar y publicar" : "Guardar y publicar",
    needsConfirmation: false,
  };
}
