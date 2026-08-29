import type { RawFidelityRow, RawFidelitySummary } from "./benefitRawFidelity";

export type ReconciliationTone = "healthy" | "attention" | "waiting" | "neutral";

export type OverviewAnswer = {
  description: string;
  title: string;
  tone: ReconciliationTone;
};

export type Explanation = {
  cause: string;
  description: string;
  label: string;
  nextStep: string;
  tone: ReconciliationTone;
};

export type IssueGroupKey = "content" | "coverage" | "locations" | "duplicates" | "waiting";

export type IssueGroup = {
  count: number;
  description: string;
  key: IssueGroupKey;
  title: string;
  tone: ReconciliationTone;
  verdicts: string[];
};

export const PUBLICATION_STATE_EXPLANATIONS: Record<string, { description: string; label: string }> = {
  failed: {
    label: "No pudo completarse",
    description: "El procesamiento tuvo un error antes de dejar este beneficio listo para publicar.",
  },
  ignored: {
    label: "Se decidió no publicar",
    description: "Fue revisado y quedó fuera de forma consciente; no es una falla de comparación.",
  },
  needs_review: {
    label: "Esperando revisión humana",
    description: "Falta que una persona confirme o corrija información antes de publicarlo.",
  },
  pending: {
    label: "Aún se está procesando",
    description: "El scraper lo encontró, pero el proceso de publicación todavía no terminó.",
  },
  published: {
    label: "Marcado como publicado",
    description: "La corrida válida registró que este hallazgo terminó en una publicación.",
  },
  unknown: {
    label: "Sin una razón registrada",
    description: "No hay suficiente información para explicar en qué etapa quedó.",
  },
};

const NEW_PUBLICATION_EXPLANATIONS: Record<string, { description: string; label: string }> = {
  in_review: { label: "Esperando revisión humana", description: "El beneficio quedó en revisión y no se considera una falla de salud." },
  intentionally_ignored: { label: "Ignorado intencionalmente", description: "El proceso registró que este hallazgo fue ignorado de forma consciente." },
  pipeline_failed: { label: "Falló el procesamiento", description: "El pipeline no pudo completar este hallazgo y requiere investigación." },
  pipeline_pending: { label: "Procesamiento pendiente", description: "El hallazgo aún no tiene un estado terminal de publicación." },
  unexplained_not_published: { label: "No publicado sin explicación", description: "El hallazgo no está publicado y tampoco tiene evidencia suficiente de por qué." },
};

const FIELD_LABELS: Record<string, string> = {
  category_slug: "Categoría",
  channel: "Dónde se puede usar",
  code: "Código de descuento",
  description_raw: "Descripción y condiciones",
  ends_at: "Fecha de término",
  image_url: "Imagen",
  instructions: "Instrucciones",
  merchant_addresses: "Direcciones",
  merchant_location_candidates: "Direcciones",
  phone: "Teléfono",
  redemption_details: "Instrucciones para usarlo",
  redemption_method: "Forma de uso",
  source_url: "Página de origen",
  starts_at: "Fecha de inicio",
  title: "Título",
  url: "Enlace para usarlo",
  value: "Valor del beneficio",
  value_type: "Tipo de beneficio",
};

function countVerdicts(summary: RawFidelitySummary, verdicts: string[]) {
  return verdicts.reduce((total, verdict) => total + (summary.verdicts[verdict] ?? 0), 0);
}

export function getOverviewAnswer(summary: RawFidelitySummary | null): OverviewAnswer {
  if (!summary) {
    return {
      title: "Comparando el catálogo publicado con el scraper…",
      description: "Estamos reuniendo la última evidencia válida de cada emisor.",
      tone: "neutral",
    };
  }

  const waiting = summary.verdicts.no_completed_run ?? 0;
  if (summary.fidelity_comparable === 0) {
    return {
      title: "Todavía no hay evidencia suficiente para responder",
      description: waiting > 0
        ? `${waiting} ${waiting === 1 ? "caso necesita" : "casos necesitan"} una corrida exitosa antes de poder comparar.`
        : "No hay publicaciones con evidencia comparable en el alcance seleccionado.",
      tone: "waiting",
    };
  }

  if (summary.reconciliation_issues === 0 && summary.published_gaps === 0 && waiting > 0) {
    return {
      title: `Lo que se puede comparar coincide, pero ${waiting === 1 ? "falta 1 caso por medir" : `faltan ${waiting} casos por medir`}`,
      description: `${summary.fidelity_matches} ${summary.fidelity_matches === 1 ? "publicación que se puede comparar conserva" : "publicaciones que se pueden comparar conservan"} la información del scraper. Los casos sin corrida válida quedan fuera del porcentaje.`,
      tone: "waiting",
    };
  }

  if (summary.reconciliation_issues === 0 && summary.published_gaps === 0) {
    return {
      title: "Sí: lo publicado coincide con la última corrida válida",
      description: `${summary.fidelity_matches} ${summary.fidelity_matches === 1 ? "publicación que se puede comparar conserva" : "publicaciones que se pueden comparar conservan"} la información entregada por el scraper.`,
      tone: "healthy",
    };
  }

  const issues = summary.reconciliation_issues;
  const comparableDifferences = Math.max(0, summary.fidelity_comparable - summary.fidelity_matches);
  const differencesWithoutTwoSides = Math.max(0, issues - comparableDifferences);
  const comparisonBreakdown = [
    `${summary.fidelity_matches} de ${summary.fidelity_comparable} publicaciones que se pueden comparar coinciden`,
    comparableDifferences > 0
      ? `${comparableDifferences} ${comparableDifferences === 1 ? "presenta" : "presentan"} una diferencia dentro de esa comparación`
      : null,
    differencesWithoutTwoSides > 0
      ? `${differencesWithoutTwoSides} ${differencesWithoutTwoSides === 1 ? "caso no entra" : "casos no entran"} en el porcentaje porque falta el hallazgo del scraper o la publicación activa`
      : null,
  ].filter(Boolean).join("; ");
  return {
    title: issues === 1
      ? "Hay 1 diferencia que necesita explicación"
      : `Hay ${issues} diferencias que necesitan explicación`,
    description: `${comparisonBreakdown}. Abajo se muestra dónde están las diferencias y qué las puede explicar.${waiting > 0 ? ` Además, ${waiting === 1 ? "1 caso todavía no tiene" : `${waiting} casos todavía no tienen`} una corrida válida para comparar.` : ""}`,
    tone: "attention",
  };
}

export function getIssueGroups(summary: RawFidelitySummary | null): IssueGroup[] {
  const safeSummary = summary ?? {
    verdicts: {},
  } as RawFidelitySummary;
  const definitions: Array<Omit<IssueGroup, "count">> = [
    {
      key: "content",
      title: "El contenido dice algo distinto",
      description: "Cambió el título, las condiciones, las fechas, el descuento u otro dato entregado por el scraper.",
      tone: "attention",
      verdicts: ["raw_drift"],
    },
    {
      key: "coverage",
      title: "Falta en uno de los dos lados",
      description: "El scraper esperaba una publicación que ya no está, o existe una publicación que no apareció en la corrida válida.",
      tone: "attention",
      verdicts: ["missing_published", "raw_missing", "absent_from_last_run"],
    },
    {
      key: "locations",
      title: "Las direcciones no se explican",
      description: "Falta o sobra una dirección, pertenece a otro comercio o el texto visible cambió sin una procedencia registrada.",
      tone: "attention",
      verdicts: ["location_merchant_mismatch", "location_drift", "address_presentation_drift", "location_processing_gap"],
    },
    {
      key: "duplicates",
      title: "Varias fuentes terminaron juntas",
      description: "Dos o más páginas distintas del scraper apuntan a una sola publicación y hay que confirmar si es intencional.",
      tone: "attention",
      verdicts: ["duplicate_source_urls"],
    },
    {
      key: "waiting",
      title: "Aún no se puede comparar",
      description: "El emisor todavía no tiene una corrida exitosa con evidencia guardada para usar como referencia.",
      tone: "waiting",
      verdicts: ["no_completed_run"],
    },
  ];

  return definitions.map((definition) => ({
    ...definition,
    count: countVerdicts(safeSummary, definition.verdicts),
  }));
}

// The RPC gained a health_verdict column after the original dashboard shipped.
// Keeping this helper here makes filtering and labels use the new contract while
// preserving legacy verdict responses.
export function getHealthVerdict(row: RawFidelityRow) {
  return row.health_verdict ?? row.verdict;
}

export function getPublicationStateExplanation(state: string | null | undefined) {
  return NEW_PUBLICATION_EXPLANATIONS[state ?? ""] ?? PUBLICATION_STATE_EXPLANATIONS[state ?? "unknown"] ?? PUBLICATION_STATE_EXPLANATIONS.unknown;
}

export function humanizeReconciliationField(field: string) {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

export function getRowExplanation(row: RawFidelityRow): Explanation {
  const changedFields = row.raw_drift_fields?.map(humanizeReconciliationField) ?? [];
  const missingFields = row.published_gap_fields?.map(humanizeReconciliationField) ?? [];
  const state = getPublicationStateExplanation(row.publication_state ?? row.draft_status ?? row.raw_status);
  const verdict = row.health_verdict ?? row.verdict;
  const publicationExplanation = row.publication_explanation?.trim();

  switch (verdict) {
    case "ok":
      return {
        label: "Coincide con el scraper",
        description: "La publicación activa conserva la información y las direcciones observadas en la última corrida válida.",
        cause: "No se encontraron diferencias en los datos que entrega directamente el scraper.",
        nextStep: "No requiere acción.",
        tone: "healthy",
      };
    case "not_published":
    case "in_review":
    case "intentionally_ignored":
      return {
        label: state.label,
        description: `${publicationExplanation ?? state.description} Por eso no aparece en el catálogo publicado.`,
        cause: "El hallazgo está contabilizado y tiene una explicación neutral; no es una diferencia entre el scraper y una publicación.",
        nextStep: verdict === "in_review" || row.publication_state === "needs_review"
          ? "Revisar la tarea pendiente si se quiere decidir su publicación."
          : "No requiere corregir esta comparación.",
        tone: "neutral",
      };
    case "pipeline_failed":
      return {
        label: "Falló el procesamiento",
        description: publicationExplanation ?? "El pipeline encontró un error y no pudo dejar este beneficio listo para publicar.",
        cause: [row.failure_stage, row.failure_code].filter(Boolean).join(" / ") || "El estado durable del draft indica un fallo.",
        nextStep: row.failure_message ? `Investigar: ${row.failure_message}` : "Investigar el error antes de reintentar la publicación.",
        tone: "attention",
      };
    case "pipeline_pending":
      return {
        label: "Procesamiento pendiente",
        description: publicationExplanation ?? "El hallazgo no llegó todavía a un estado terminal de publicación.",
        cause: "No hay un evento durable que confirme publicación, revisión, ignore o fallo.",
        nextStep: "Revisar el estado del pipeline y sus colas antes de intervenir.",
        tone: "attention",
      };
    case "unexplained_not_published":
      return {
        label: "No publicado sin explicación",
        description: publicationExplanation ?? "No aparece en el catálogo y falta evidencia durable para explicar el resultado.",
        cause: "El estado del raw, el draft y la publicación no forman una explicación consistente.",
        nextStep: "Investigar la evidencia congelada y corregir el contrato de publicación.",
        tone: "attention",
      };
    case "location_processing_gap":
      return {
        label: "Faltan direcciones procesadas",
        description: `${row.missing_processed_addresses?.length ?? Math.max(0, (row.address_expected_count ?? row.raw_address_count ?? 0) - (row.address_processed_count ?? 0))} ${row.missing_processed_addresses?.length === 1 ? "dirección esperada no fue" : "direcciones esperadas no fueron"} procesada${row.missing_processed_addresses?.length === 1 ? "" : "s"}.`,
        cause: row.address_processing_status ? `Estado del procesamiento: ${row.address_processing_status}.` : "La publicación no conserva cobertura procesada para todas las direcciones esperadas.",
        nextStep: "Revisar las direcciones faltantes y el estado de procesamiento del comercio.",
        tone: "attention",
      };
    case "missing_published":
      return {
        label: "Se esperaba una publicación, pero ya no está activa",
        description: "La corrida válida registró que este hallazgo fue publicado, pero hoy no existe una publicación activa correspondiente.",
        cause: "Puede haberse despublicado, expirado o desvinculado después de esa corrida.",
        nextStep: "Confirmar si la ausencia es intencional y revisar el historial de la publicación.",
        tone: "attention",
      };
    case "raw_missing":
      return {
        label: "Hay una publicación sin respaldo del scraper",
        description: "Este beneficio está activo, pero no hay registro de que el scraper lo haya encontrado en la última corrida válida ni un hallazgo actual vinculado.",
        cause: "Puede ser una publicación huérfana o una identidad de origen que quedó mal vinculada.",
        nextStep: "Confirmar su página de origen y si todavía corresponde mantenerlo publicado.",
        tone: "attention",
      };
    case "absent_from_last_run":
      return {
        label: "Ya no apareció en la última corrida válida",
        description: "El beneficio sigue publicado y existe evidencia previa, pero el emisor dejó de entregarlo en el catálogo usado como referencia.",
        cause: "La fuente pudo retirar el beneficio o el scraper pudo dejar de encontrarlo.",
        nextStep: "Abrir la fuente y comprobar si el beneficio todavía existe antes de decidir qué hacer.",
        tone: "attention",
      };
    case "raw_drift":
      return {
        label: "El scraper y la publicación dicen cosas distintas",
        description: changedFields.length
          ? `Las diferencias están en: ${changedFields.join(", ")}.`
          : "Uno o más datos entregados por el scraper no coinciden con lo publicado.",
        cause: `Puede ser una corrección intencional, un dato que quedó antiguo o un problema del procesamiento.${missingFields.length ? ` Además, la publicación perdió información que sí venía en el scraper: ${missingFields.join(", ")}.` : ""}`,
        nextStep: "Comparar la fuente con la publicación y documentar cuál de los dos valores es el correcto.",
        tone: "attention",
      };
    case "location_merchant_mismatch":
      return {
        label: "Una dirección pertenece a otro comercio",
        description: `${row.mismatched_location_count ?? "Una o más"} ${row.mismatched_location_count === 1 ? "dirección vinculada corresponde" : "direcciones vinculadas corresponden"} a un comercio distinto del beneficio.`,
        cause: "La dirección puede ser correcta como lugar, pero su vínculo de comercio no lo es.",
        nextStep: "Revisar el comercio dueño de cada dirección antes de corregir el vínculo.",
        tone: "attention",
      };
    case "location_drift":
      return {
        label: "No coincide el conjunto de direcciones",
        description: `El scraper entregó ${row.raw_address_count ?? "—"} ${row.raw_address_count === 1 ? "dirección" : "direcciones"} y hay ${row.published_address_count ?? "—"} ${row.published_address_count === 1 ? "publicada" : "publicadas"}.`,
        cause: "Hay direcciones que faltan, sobran o quedaron vinculadas con otro registro.",
        nextStep: "Revisar las listas de direcciones de ambos lados que aparecen más abajo.",
        tone: "attention",
      };
    case "address_presentation_drift":
      return {
        label: "El texto de una dirección cambió sin explicación registrada",
        description: "La dirección base coincide, pero el texto visible fue modificado y no hay evidencia de que Google u otra procedencia permitida explique el cambio.",
        cause: row.address_presentation_status === "invalid_source_reference"
          ? "La referencia que identifica la dirección original no tiene un formato válido."
          : "Hoy no existe un registro auditable que permita tratar el cambio como una corrección manual intencional.",
        nextStep: "Confirmar la dirección correcta y su procedencia antes de modificarla.",
        tone: "attention",
      };
    case "duplicate_source_urls":
      return {
        label: "Varias páginas de origen terminaron en una sola publicación",
        description: `${row.source_url_count ?? "Varias"} páginas distintas de la corrida válida apuntan a este mismo beneficio publicado.`,
        cause: "Puede ser una agrupación legítima o dos beneficios diferentes que se combinaron por error.",
        nextStep: "Abrir todas las fuentes y confirmar si cada una merece una publicación independiente.",
        tone: "attention",
      };
    case "no_completed_run":
      return {
        label: "Todavía no existe una corrida válida para comparar",
        description: "Este emisor aún no tiene una corrida exitosa con evidencia guardada después de habilitar esta medición.",
        cause: "Un intento fallido o incompleto no se usa como referencia porque podría producir diferencias falsas.",
        nextStep: "Esperar una corrida exitosa; este caso no reduce el porcentaje mientras tanto.",
        tone: "waiting",
      };
    default:
      return {
        label: "Necesita revisión",
        description: "La comparación encontró un estado que todavía no tiene una explicación preparada.",
        cause: "El sistema recibió un resultado nuevo o inesperado y no debe adivinar su significado.",
        nextStep: "Abrir la evidencia técnica y confirmar el contrato antes de tomar una decisión.",
        tone: "attention",
      };
  }
}

export function formatScrapeAttemptStatus(status: string | null | undefined) {
  const labels: Record<string, string> = {
    failed: "El intento más reciente falló",
    running: "Hay un intento en curso",
    succeeded: "El intento más reciente terminó correctamente",
    succeeded_with_errors: "El intento más reciente terminó con algunos errores",
  };
  return labels[status ?? ""] ?? "Sin información del intento más reciente";
}
