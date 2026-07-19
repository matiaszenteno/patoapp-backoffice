// Traduce el vocabulario cerrado del pipeline (field_provenance, publication_blockers) a algo
// que un operador humano pueda leer. El productor es scrapers/contracts.py; los sources salen
// de ALLOWED_DRAFT_PROVENANCE_SOURCES y las razones de las llaves `needs_review:<reason>`.

export type FieldProvenance = {
  confidence?: number;
  method?: string;
  reason?: string;
  source?: string;
  version?: string;
};

/** Umbral bajo el cual el pipeline manda las reglas a revisión humana.
 *  Espejo de BENEFIT_RULES_REVIEW_CONFIDENCE_THRESHOLD en scrapers/pipeline.py. */
export const RULES_REVIEW_CONFIDENCE_THRESHOLD = 0.6;

const SOURCE_LABELS: Record<string, string> = {
  ai: "IA",
  default: "Valor por defecto",
  deterministic_parser: "Regla determinística",
  issuer_fallback: "Heredado del emisor",
  manual: "Corrección humana",
  merchant_resolution: "Match de merchant",
  normalizer: "Normalizado",
  published_existing: "Ya publicado antes",
  scraper: "Del sitio del emisor",
  scraper_hint: "Pista del sitio",
  sibling_inheritance: "Heredado de otro beneficio del grupo",
};

const MERCHANT_METHOD_LABELS: Record<string, string> = {
  exact: "Match exacto de merchant",
  fuzzy: "Match difuso de merchant",
  new_merchant: "Merchant nuevo",
};

export const BLOCKER_LABELS: Record<string, string> = {
  ai_description_missing: "Falta la descripción para la app",
  benefit_expired: "El beneficio ya expiró",
  category_id_missing: "Falta la categoría",
  channel_missing: "Falta el canal",
  description_missing: "Falta la descripción",
  image_url_missing: "Falta la imagen",
  merchant_id_missing: "Falta el merchant",
  merchant_name_missing: "Falta el nombre del merchant",
  needs_manual_review: "Requiere revisión humana",
  semantic_vector_missing: "Falta el vector semántico",
  source_url_missing: "Falta la URL de origen",
  title_missing: "Falta el título",
};

export const REVIEW_REASON_LABELS: Record<string, string> = {
  days_ambiguous: "Los días de validez se contradicen en el texto original",
  rules_uncertain: "La IA extrajo reglas pero no confía en ellas",
  value_ambiguous: "El monto del descuento es ambiguo en el texto original",
};

/** Campos del form que el operador debe mirar para resolver cada razón de revisión.
 *  Son los que el pipeline marcó como dudosos: mostrar los ~20 campos obliga al operador
 *  a adivinar cuál era el problema. */
export const REASON_FIELDS: Record<string, string[]> = {
  days_ambiguous: ["br_dias_mode", "br_dias_validos"],
  rules_uncertain: [
    "br_dias_mode",
    "br_dias_validos",
    "br_max_cap",
    "br_frequency",
    "br_min_compra",
    "br_cuotas_minimas",
  ],
  value_ambiguous: ["value", "value_type"],
};

/** Campo del form que resuelve cada blocker de tipo "falta el dato". */
export const BLOCKER_FIELD: Record<string, string> = {
  ai_description_missing: "ai_description",
  category_id_missing: "category_slug",
  channel_missing: "channel",
  description_missing: "ai_description",
  image_url_missing: "image_url",
  title_missing: "title",
};

const REVIEW_REASON_PREFIX = "needs_review:";

/** Extrae las razones de revisión que el pipeline dejó anotadas en field_provenance.
 *  Viven como llaves `needs_review:<reason>`, no como un campo del draft. */
export function getReviewReasons(
  provenance: Record<string, FieldProvenance> | null | undefined,
): string[] {
  if (!provenance) return [];
  return Object.keys(provenance)
    .filter((key) => key.startsWith(REVIEW_REASON_PREFIX))
    .map((key) => key.slice(REVIEW_REASON_PREFIX.length));
}

/** Campos del form implicados por las razones activas. Vacío significa que no sabemos qué
 *  mirar, y el llamador debe caer a mostrar el beneficio completo en vez de un bloque vacío. */
export function getFieldsToReview(reasons: string[]): string[] {
  return [...new Set(reasons.flatMap((reason) => REASON_FIELDS[reason] ?? []))];
}

export function formatConfidence(confidence: number | null | undefined): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return `${Math.round(confidence * 100)}%`;
}

export type ProvenanceDisplay = {
  /** Porcentaje ya formateado, o null cuando el dato no es una inferencia con confianza.
   *  Nunca se inventa: que el scraper no traiga confianza es una garantía, no un faltante. */
  confidence: string | null;
  isLowConfidence: boolean;
  /** True para new_merchant: puede ser un duplicado que el fuzzy no alcanzó a pescar. */
  needsAttention: boolean;
  label: string;
};

/** Arma la etiqueta de un campo: quién lo extrajo, con qué versión y con cuánta confianza. */
export function describeProvenance(
  provenance: FieldProvenance | null | undefined,
): ProvenanceDisplay | null {
  if (!provenance?.source) return null;

  const base = provenance.source === "merchant_resolution" && provenance.method
    ? MERCHANT_METHOD_LABELS[provenance.method] ?? SOURCE_LABELS.merchant_resolution
    : SOURCE_LABELS[provenance.source] ?? provenance.source.replace(/_/g, " ");

  const confidence = formatConfidence(provenance.confidence);
  const label = provenance.version ? `${base} · ${provenance.version}` : base;

  return {
    confidence,
    isLowConfidence:
      typeof provenance.confidence === "number"
      && provenance.confidence < RULES_REVIEW_CONFIDENCE_THRESHOLD,
    label,
    needsAttention: provenance.method === "new_merchant",
  };
}
