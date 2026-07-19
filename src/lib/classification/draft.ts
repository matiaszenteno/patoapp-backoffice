// Lectura y escritura del draft canónico (benefit_ingestion_drafts). El draft es el snapshot
// compuesto por el pipeline; una corrección humana sólo lo pisa después de cargarlo, y sólo
// persisten los overrides reales — serializar el form entero convertiría cada campo del draft
// en una corrección manual permanente.

export type FormState = {
  ai_description: string;
  br_cuotas_minimas: string;
  br_dias_mode: "all" | "specific";
  br_dias_validos: string[];
  br_frequency: string;
  br_max_cap: string;
  br_min_compra: string;
  category_slug: string;
  channel: string;
  description_raw: string;
  ends_at: string;
  image_url: string;
  note: string;
  rd_code: string;
  rd_url: string;
  redemption_method: string;
  starts_at: string;
  title: string;
  value: string;
  value_type: string;
};

export type IngestionDraft = {
  benefit_id: string | null;
  draft: Record<string, unknown>;
  draft_status: string;
  field_provenance: Record<string, import("./vocabulary").FieldProvenance> | null;
  normalized_version: string | null;
  publication_blockers: string[] | null;
  raw_benefit_id: string;
  run_id: string | null;
  schema_version: string;
  source_content_hash: string;
  updated_at: string;
};

export const DIAS_OPTIONS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

const DAY_LABEL_TO_INDEX: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
};

const DAY_INDEX_TO_LABEL = Object.fromEntries(
  Object.entries(DAY_LABEL_TO_INDEX).map(([label, index]) => [String(index), label]),
) as Record<string, string>;

/** Correcciones que sobreviven a un re-scrape: identifican al comercio o su categoría, y no
 *  dependen del texto puntual que se scrapeó. El resto se descarta si el raw cambió. */
const DURABLE_CORRECTION_FIELDS = new Set([
  "category_slug",
  "merchant_id",
  "merchant_name",
  "merchant_normalized_name",
]);

const RULE_KEYS = ["max_cap", "frequency", "days", "min_purchase", "installments_count"];
const REDEMPTION_KEYS = ["code", "url", "qr_url"];

export function serializeRedemptionDetails(
  method: string,
  code: string,
  url: string,
): Record<string, unknown> | null {
  if (method === "code" || method === "coupon") return code.trim() ? { code: code.trim() } : null;
  if (method === "qr") return url.trim() ? { qr_url: url.trim() } : null;
  if (method === "app_link" || method === "deep_link") return url.trim() ? { url: url.trim() } : null;
  return null;
}

export function deserializeRedemptionDetails(
  rd: Record<string, unknown> | null | undefined,
): { code: string; url: string } {
  if (!rd) return { code: "", url: "" };
  return { code: String(rd.code ?? ""), url: String(rd.url ?? rd.qr_url ?? "") };
}

export function serializeBenefitRules(vals: FormState): Record<string, unknown> | null {
  const rules: Record<string, unknown> = {};
  const maxCap = Number(vals.br_max_cap);
  const minPurchase = Number(vals.br_min_compra);
  const installmentsCount = Number(vals.br_cuotas_minimas);
  if (vals.br_max_cap.trim() && Number.isFinite(maxCap)) rules.max_cap = maxCap;
  if (vals.br_frequency) rules.frequency = vals.br_frequency;
  if (vals.br_dias_mode === "specific" && vals.br_dias_validos.length) {
    rules.days = vals.br_dias_validos
      .map((dia) => DAY_LABEL_TO_INDEX[dia])
      .filter((dia) => dia !== undefined);
  }
  if (vals.br_min_compra.trim() && Number.isFinite(minPurchase)) rules.min_purchase = minPurchase;
  if (vals.br_cuotas_minimas.trim() && Number.isFinite(installmentsCount)) {
    rules.installments_count = installmentsCount;
  }
  return Object.keys(rules).length ? rules : null;
}

export function deserializeBenefitRules(br: Record<string, unknown> | null | undefined) {
  if (!br) {
    return {
      cuotas_minimas: "",
      dias_mode: "all" as const,
      dias_validos: [] as string[],
      frequency: "",
      max_cap: "",
      min_compra: "",
    };
  }
  const canonicalDays = Array.isArray(br.days)
    ? br.days.map((day) => DAY_INDEX_TO_LABEL[String(day)]).filter(Boolean)
    : [];
  const legacyDays = Array.isArray(br.dias_validos) ? (br.dias_validos as string[]) : [];
  const diasValidos = canonicalDays.length ? canonicalDays : legacyDays;
  const legacyMaxCap = br.tope_mensual ?? br.tope_diario;
  const legacyFrequency = br.tope_mensual != null ? "monthly" : br.tope_diario != null ? "daily" : "";
  return {
    cuotas_minimas: br.installments_count != null
      ? String(br.installments_count)
      : br.cuotas_minimas != null ? String(br.cuotas_minimas) : "",
    dias_mode: diasValidos.length > 0 ? ("specific" as const) : ("all" as const),
    dias_validos: diasValidos,
    frequency: br.frequency != null ? String(br.frequency) : legacyFrequency,
    max_cap: br.max_cap != null
      ? String(br.max_cap)
      : legacyMaxCap != null ? String(legacyMaxCap) : "",
    min_compra: br.min_purchase != null
      ? String(br.min_purchase)
      : br.min_compra != null ? String(br.min_compra) : "",
  };
}

function toDateInput(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.slice(0, 10);
}

export function sameCorrectionValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function hasOwnValue(
  source: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

export function formFromDraft(
  draft: Record<string, unknown>,
  correction: Record<string, unknown> | null,
  note: string | null,
): FormState {
  const values = { ...draft, ...(correction ?? {}) };
  const rd = deserializeRedemptionDetails(
    values.redemption_details as Record<string, unknown> | null | undefined,
  );
  const br = deserializeBenefitRules(
    values.benefit_rules as Record<string, unknown> | null | undefined,
  );
  return {
    ai_description: String(values.ai_description ?? ""),
    br_cuotas_minimas: br.cuotas_minimas,
    br_dias_mode: br.dias_mode,
    br_dias_validos: br.dias_validos,
    br_frequency: br.frequency,
    br_max_cap: br.max_cap,
    br_min_compra: br.min_compra,
    category_slug: String(values.category_slug ?? ""),
    channel: String(values.channel ?? ""),
    description_raw: String(values.description_raw ?? ""),
    ends_at: toDateInput(values.ends_at),
    image_url: String(values.image_url ?? ""),
    note: note ?? "",
    rd_code: rd.code,
    rd_url: rd.url,
    redemption_method: String(values.redemption_method ?? ""),
    starts_at: toDateInput(values.starts_at),
    title: String(values.title ?? ""),
    value: values.value == null ? "" : String(values.value),
    value_type: String(values.value_type ?? ""),
  };
}

/** Descarta la parte de una corrección que quedó anclada a un raw o schema que ya cambió.
 *  Sólo sobreviven los campos durables: el resto describía un texto que ya no existe. */
export function correctionForDraft(
  correction: Record<string, unknown> | null,
  baseContentHash: string | null,
  baseSchemaVersion: string | null,
  draft: IngestionDraft,
): Record<string, unknown> | null {
  if (!correction) return null;
  const isAnchoredAndStale = (
    baseContentHash !== null && baseContentHash !== draft.source_content_hash
  ) || (
    baseSchemaVersion !== null && baseSchemaVersion !== draft.schema_version
  );
  if (!isAnchoredAndStale) return correction;
  return Object.fromEntries(
    Object.entries(correction).filter(([field]) => DURABLE_CORRECTION_FIELDS.has(field)),
  );
}

/** Arma el payload de corrección: sólo los campos donde el operador se apartó del draft.
 *
 *  `confirmReview` es la acción de confirmación humana, no un campo del formulario. Antes
 *  vivía como `resolve_needs_review` dentro de FormState, sin ningún control que lo pusiera
 *  en true, lo que dejó la cola congelada: el blocker `needs_manual_review` nunca se resolvía
 *  y el botón Guardar quedaba deshabilitado para siempre. */
export function buildCorrectionFields({
  blockers,
  confirmReview,
  draft,
  vals,
}: {
  blockers: string[];
  confirmReview: boolean;
  draft: IngestionDraft;
  vals: FormState;
}): Record<string, unknown> {
  const cf: Record<string, unknown> = {};

  if (vals.title.trim()) cf.title = vals.title.trim();
  if (vals.description_raw.trim()) cf.description_raw = vals.description_raw.trim();
  else if (vals.ai_description.trim() && blockers.includes("description_missing")) {
    cf.description_raw = vals.ai_description.trim();
  }
  if (vals.image_url.trim()) cf.image_url = vals.image_url.trim();
  if (vals.category_slug) cf.category_slug = vals.category_slug;
  if (vals.channel) cf.channel = vals.channel;
  if (vals.ai_description.trim()) cf.ai_description = vals.ai_description.trim();
  if (vals.starts_at) cf.starts_at = vals.starts_at;
  if (vals.ends_at) cf.ends_at = vals.ends_at;
  if (confirmReview) cf.needs_review = false;
  if (vals.value_type) cf.value_type = vals.value_type;
  const parsedValue = Number(vals.value);
  if (vals.value.trim() && Number.isFinite(parsedValue)) cf.value = parsedValue;
  if (vals.redemption_method) cf.redemption_method = vals.redemption_method;

  const rd = serializeRedemptionDetails(vals.redemption_method, vals.rd_code, vals.rd_url);
  if (rd) cf.redemption_details = rd;
  const br = serializeBenefitRules(vals);
  if (br) cf.benefit_rules = br;

  const draftForm = formFromDraft(draft.draft, null, null);

  // benefit_rules y redemption_details se mergean en vez de reemplazarse: el draft puede traer
  // llaves que el formulario no expone (display_price, por ejemplo) y pisarlas las borraría.
  const draftRules = serializeBenefitRules(draftForm);
  if (sameCorrectionValue(br, draftRules)) {
    delete cf.benefit_rules;
  } else {
    const mergedRules = {
      ...((draft.draft.benefit_rules as Record<string, unknown> | null) ?? {}),
    };
    for (const key of RULE_KEYS) delete mergedRules[key];
    Object.assign(mergedRules, br ?? {});
    cf.benefit_rules = mergedRules;
  }

  const draftRedemption = serializeRedemptionDetails(
    draftForm.redemption_method,
    draftForm.rd_code,
    draftForm.rd_url,
  );
  if (sameCorrectionValue(rd, draftRedemption)) {
    delete cf.redemption_details;
  } else {
    // Si cambió el método, los detalles del método anterior no aplican: se descartan enteros.
    const methodChanged = vals.redemption_method !== draftForm.redemption_method;
    const mergedRedemption = methodChanged
      ? { ...(rd ?? {}) }
      : {
          ...((draft.draft.redemption_details as Record<string, unknown> | null) ?? {}),
          ...(rd ?? {}),
        };
    for (const key of REDEMPTION_KEYS) {
      if (!rd || !Object.prototype.hasOwnProperty.call(rd, key)) delete mergedRedemption[key];
    }
    cf.redemption_details = mergedRedemption;
  }

  // Vaciar una fecha que el draft traía es un override explícito a null, no un campo ausente.
  if (!vals.starts_at && draft.draft.starts_at) cf.starts_at = null;
  if (!vals.ends_at && draft.draft.ends_at) cf.ends_at = null;

  for (const field of Object.keys(cf)) {
    if (field === "benefit_rules" || field === "redemption_details") continue;
    if (sameCorrectionValue(cf[field], draft.draft[field])) delete cf[field];
  }

  return cf;
}
