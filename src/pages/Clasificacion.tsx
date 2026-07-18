import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getFreshAccessToken } from "../lib/auth";
import {
  buildCorrectionReprocessBody,
  type CorrectionReprocessResponse,
  getChangedCorrectionFields,
  getFunctionErrorMessage,
  getReprocessFailureMessage,
} from "../lib/correctionReprocess";
import { inputCls, inputReqCls } from "../lib/styles";
import { useIssuers } from "../lib/useIssuers";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = {
  id: string;
  issuer_slug: string | null;
  source_url: string | null;
  raw_payload: Record<string, unknown> | null;
  scraped_at: string | null;
  processing_status: string | null;
  benefit_id: string | null;
  run_id: string | null;
  publication_blockers: string[] | null;
};

type AiValues = {
  title?: string;
  description_raw?: string;
  image_url?: string;
  category_slug?: string;
  channel?: string;
  ai_description?: string;
  value_type?: string;
  value?: string;
};

type IngestionDraft = {
  raw_benefit_id: string;
  run_id: string | null;
  benefit_id: string | null;
  source_content_hash: string;
  schema_version: string;
  normalized_version: string | null;
  draft_status: string;
  draft: Record<string, unknown>;
  field_provenance: Record<string, FieldProvenance> | null;
  publication_blockers: string[] | null;
  updated_at: string;
};

type FieldProvenance = {
  source?: string;
  processor?: string;
  version?: string;
};

type CardData = {
  blockers: string[];
  aiConfidence: AiConfidence[];
  aiValues: AiValues;
  existingCorrection: Record<string, unknown> | null;
  existingNote: string | null;
  correctionBaseContentHash: string | null;
  correctionBaseSchemaVersion: string | null;
  correctionBaseUpdatedAt: string | null;
  runId: string | null;
  runError: string | null;
  runDetails: RunDetails | null;
  draft: IngestionDraft | null;
  dataMode: "persisted" | "legacy" | "unsupported";
};

type RunDetails = {
  id: string;
  issuer_slug: string | null;
  status: string | null;
  items_found: number | null;
  items_inserted: number | null;
  started_at: string | null;
  finished_at: string | null;
};

type AiConfidence = {
  confidence: number | null;
  description: string;
  label: string;
  processor: string;
  reason: string | null;
};

type FormState = {
  title: string;
  description_raw: string;
  image_url: string;
  category_slug: string;
  channel: string;
  ai_description: string;
  starts_at: string;
  ends_at: string;
  resolve_needs_review: boolean;
  value_type: string;
  value: string;
  redemption_method: string;
  rd_code: string;
  rd_url: string;
  br_max_cap: string;
  br_frequency: string;
  br_dias_mode: "all" | "specific";
  br_dias_validos: string[];
  br_min_compra: string;
  br_cuotas_minimas: string;
  note: string;
};

const usePersistedIngestionDrafts = import.meta.env.VITE_USE_PERSISTED_INGESTION_DRAFTS === "true";
const SUPPORTED_INGESTION_DRAFT_SCHEMA = "2026-07-draft-v1";
const DURABLE_CORRECTION_FIELDS = new Set([
  "category_slug",
  "merchant_id",
  "merchant_name",
  "merchant_normalized_name",
]);

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_SLUG_OPTIONS = [
  { value: "", label: "" },
  { value: "automotriz", label: "Automotriz" },
  { value: "deporte", label: "Deporte" },
  { value: "educacion", label: "Educación" },
  { value: "entretencion", label: "Entretención" },
  { value: "hogar", label: "Hogar" },
  { value: "mascotas", label: "Mascotas" },
  { value: "moda", label: "Moda" },
  { value: "otros", label: "Otros (la IA no supo)" },
  { value: "restaurantes", label: "Restaurantes" },
  { value: "salud-belleza", label: "Salud y Belleza" },
  { value: "servicios", label: "Servicios" },
  { value: "streaming", label: "Streaming" },
  { value: "supermercados", label: "Supermercados" },
  { value: "tecnologia", label: "Tecnología" },
  { value: "viajes", label: "Viajes" },
];

const CHANNEL_OPTIONS = [
  { value: "", label: "" },
  { value: "online", label: "Online" },
  { value: "physical", label: "Físico" },
  { value: "hybrid", label: "Híbrido" },
];

const VALUE_TYPE_OPTIONS = [
  { value: "", label: "" },
  { value: "percentage", label: "Porcentaje" },
  { value: "fixed_amount", label: "Monto fijo" },
  { value: "free_item", label: "Producto gratis" },
  { value: "two_for_one", label: "2x1" },
  { value: "installments", label: "Cuotas" },
  { value: "cashback", label: "Cashback" },
  { value: "preventa_exclusiva", label: "Preventa exclusiva" },
  { value: "acceso_anticipado", label: "Acceso anticipado" },
];

const REDEMPTION_METHOD_OPTIONS = [
  { value: "", label: "" },
  { value: "bin_detection", label: "Detección BIN" },
  { value: "code", label: "Código" },
  { value: "qr", label: "QR" },
  { value: "app_link", label: "Link de app" },
  { value: "coupon", label: "Cupón" },
  { value: "deep_link", label: "Deep link" },
  { value: "membership_validation", label: "Validación de membresía" },
  { value: "automatic_checkout", label: "Checkout automático" },
  { value: "gift_with_purchase", label: "Regalo con compra" },
  { value: "manual_receipt_upload", label: "Subida manual de boleta" },
];

const DIAS_OPTIONS = [
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

const BLOCKER_FIELD_MAP: Record<string, keyof FormState> = {
  title_missing: "title",
  description_missing: "description_raw",
  image_url_missing: "image_url",
  category_id_missing: "category_slug",
  channel_missing: "channel",
  ai_description_missing: "ai_description",
  needs_manual_review: "resolve_needs_review",
};

const BLOCKER_LABELS: Record<string, string> = {
  category_id_missing: "Sin categoría",
  channel_missing: "Sin canal",
  ai_description_missing: "Sin descripción IA",
  needs_manual_review: "Requiere revisión manual",
  semantic_vector_missing: "Sin vector semántico",
  image_url_missing: "Sin imagen",
  description_missing: "Sin descripción",
  title_missing: "Sin título",
  source_url_missing: "Sin URL fuente",
  merchant_id_missing: "Sin merchant",
  merchant_name_missing: "Sin nombre de merchant",
};

const LOW_CONFIDENCE_THRESHOLD = 0.65;
const RULES_REVIEW_CONFIDENCE_THRESHOLD = 0.6;

const CONFIDENCE_META: Record<string, { description: string; label: string }> = {
  benefit_category_classification: {
    description: "Categoría normalizada.",
    label: "Clasificación de categoría",
  },
  benefit_core_extraction: {
    description: "Canal, valor, método de canje y fechas.",
    label: "Extracción core",
  },
  benefit_rules_extraction: {
    description: "Topes, frecuencia, días, compra mínima y cuotas.",
    label: "Extracción de reglas",
  },
};

const REVIEW_REASON_BY_BLOCKER: Record<string, string> = {
  needs_manual_review: "La extracción de reglas quedó bajo el umbral de confianza y requiere validación humana.",
  benefit_expired: "El beneficio asociado ya expiró y requiere decisión manual.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeRedemptionDetails(method: string, code: string, url: string): Record<string, unknown> | null {
  if (method === "code" || method === "coupon") return code.trim() ? { code: code.trim() } : null;
  if (method === "qr") return url.trim() ? { qr_url: url.trim() } : null;
  if (method === "app_link" || method === "deep_link") return url.trim() ? { url: url.trim() } : null;
  return null;
}

function deserializeRedemptionDetails(rd: Record<string, unknown> | null | undefined): { code: string; url: string } {
  if (!rd) return { code: "", url: "" };
  return { code: String(rd.code ?? ""), url: String(rd.url ?? rd.qr_url ?? "") };
}

function serializeBenefitRules(vals: FormState): Record<string, unknown> | null {
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
  if (vals.br_cuotas_minimas.trim() && Number.isFinite(installmentsCount)) rules.installments_count = installmentsCount;
  return Object.keys(rules).length ? rules : null;
}

function deserializeBenefitRules(br: Record<string, unknown> | null | undefined) {
  if (!br) return { max_cap: "", frequency: "", dias_mode: "all" as const, dias_validos: [] as string[], min_compra: "", cuotas_minimas: "" };
  const canonicalDays = Array.isArray(br.days)
    ? br.days.map((day) => DAY_INDEX_TO_LABEL[String(day)]).filter(Boolean)
    : [];
  const legacyDays = Array.isArray(br.dias_validos) ? (br.dias_validos as string[]) : [];
  const diasValidos = canonicalDays.length ? canonicalDays : legacyDays;
  const legacyMaxCap = br.tope_mensual ?? br.tope_diario;
  const legacyFrequency = br.tope_mensual != null ? "monthly" : br.tope_diario != null ? "daily" : "";
  return {
    max_cap: br.max_cap != null ? String(br.max_cap) : legacyMaxCap != null ? String(legacyMaxCap) : "",
    frequency: br.frequency != null ? String(br.frequency) : legacyFrequency,
    dias_mode: diasValidos.length > 0 ? "specific" as const : "all" as const,
    dias_validos: diasValidos,
    min_compra: br.min_purchase != null ? String(br.min_purchase) : br.min_compra != null ? String(br.min_compra) : "",
    cuotas_minimas: br.installments_count != null ? String(br.installments_count) : br.cuotas_minimas != null ? String(br.cuotas_minimas) : "",
  };
}

function hasOwnValue(source: Record<string, unknown> | null | undefined, key: string) {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

function hasTextValue(value: unknown) {
  return value != null && String(value).trim() !== "";
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getCurrentValueSource({ aiValue, correctedFields, currentValue, field, rawValue }: {
  aiValue?: string;
  correctedFields?: Record<string, unknown> | null;
  currentValue: string | boolean;
  field: string;
  rawValue?: unknown;
}) {
  const correctionField = field === "resolve_needs_review" ? "needs_review" : field;
  if (hasOwnValue(correctedFields, correctionField)) return "Corrección";
  if (typeof currentValue === "boolean") return currentValue ? "Corrección" : "Pendiente";
  if (!currentValue.trim()) return "Pendiente";
  if (aiValue && currentValue === aiValue) return "IA";
  if (hasTextValue(rawValue) && currentValue === String(rawValue)) return "Raw";
  return "Sin guardar";
}

function formatProvenance(provenance: FieldProvenance | undefined) {
  if (!provenance?.source) return undefined;
  const label = provenance.source.replace(/_/g, " ");
  return provenance.version ? `${label} · ${provenance.version}` : label;
}

function toDateInput(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  return value.slice(0, 10);
}

function formFromDraft(draft: Record<string, unknown>, correction: Record<string, unknown> | null, note: string | null): FormState {
  // El draft es el snapshot compuesto y canónico. Una corrección vigente sólo lo pisa
  // después de cargarlo, nunca se vuelve a armar desde eventos del pipeline.
  const values = { ...draft, ...(correction ?? {}) };
  const rd = deserializeRedemptionDetails(values.redemption_details as Record<string, unknown> | null | undefined);
  const br = deserializeBenefitRules(values.benefit_rules as Record<string, unknown> | null | undefined);
  return {
    title: String(values.title ?? ""),
    description_raw: String(values.description_raw ?? ""),
    image_url: String(values.image_url ?? ""),
    category_slug: String(values.category_slug ?? ""),
    channel: String(values.channel ?? ""),
    ai_description: String(values.ai_description ?? ""),
    starts_at: toDateInput(values.starts_at),
    ends_at: toDateInput(values.ends_at),
    resolve_needs_review: values.needs_review === false,
    value_type: String(values.value_type ?? ""),
    value: values.value == null ? "" : String(values.value),
    redemption_method: String(values.redemption_method ?? ""),
    rd_code: rd.code,
    rd_url: rd.url,
    br_max_cap: br.max_cap,
    br_frequency: br.frequency,
    br_dias_mode: br.dias_mode,
    br_dias_validos: br.dias_validos,
    br_min_compra: br.min_compra,
    br_cuotas_minimas: br.cuotas_minimas,
    note: note ?? "",
  };
}

function correctionForDraft(
  correction: Record<string, unknown> | null,
  correctionBaseContentHash: string | null,
  correctionBaseSchemaVersion: string | null,
  draft: IngestionDraft,
) {
  if (!correction) return null;
  const isAnchoredAndStale = (
    correctionBaseContentHash !== null
    && correctionBaseContentHash !== draft.source_content_hash
  ) || (
    correctionBaseSchemaVersion !== null
    && correctionBaseSchemaVersion !== draft.schema_version
  );
  if (!isAnchoredAndStale) return correction;
  return Object.fromEntries(
    Object.entries(correction).filter(([field]) => DURABLE_CORRECTION_FIELDS.has(field)),
  );
}

function sameCorrectionValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function getConfidence(event: { confidence?: unknown; output_payload: Record<string, unknown> | null }) {
  const direct = typeof event.confidence === "number" ? event.confidence : null;
  const fromOutput = typeof event.output_payload?.confidence === "number" ? event.output_payload.confidence : null;
  return direct ?? fromOutput;
}

function getAiReason(output: Record<string, unknown> | null) {
  if (!output) return null;
  const reason = output.reason ?? output.review_reason ?? output.rationale ?? output.explanation;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

function formatConfidence(value: number | null) {
  if (value == null) return "sin dato";
  return `${Math.round(value * 100)}%`;
}

function getLatestAiConfidence(events: Array<{
  confidence?: unknown;
  output_payload: Record<string, unknown> | null;
  processor: string;
}>) {
  const seen = new Set<string>();
  const items: AiConfidence[] = [];
  for (const event of events) {
    if (seen.has(event.processor)) continue;
    const meta = CONFIDENCE_META[event.processor];
    const confidence = getConfidence(event);
    if (!meta || confidence == null) continue;
    seen.add(event.processor);
    items.push({
      confidence,
      description: meta.description,
      label: meta.label,
      processor: event.processor,
      reason: getAiReason(event.output_payload),
    });
  }
  return items;
}

function getUnresolvedCorrectionBlockers(blockers: string[], vals: FormState | null) {
  if (!vals) return blockers;

  return blockers.filter((blocker) => {
    switch (blocker) {
      case "title_missing":
        return !vals.title.trim();
      case "description_missing":
        return !vals.description_raw.trim() && !vals.ai_description.trim();
      case "image_url_missing":
        return !vals.image_url.trim();
      case "category_id_missing":
        return !vals.category_slug;
      case "channel_missing":
        return !vals.channel;
      case "ai_description_missing":
        return !vals.ai_description.trim();
      case "needs_manual_review":
        return !vals.resolve_needs_review;
      default:
        return false;
    }
  });
}

// `force` conserva la intención del operador cuando el raw ya está publicado. El dispatcher
// correctionOnly decide si puede reanudar desde el draft o si necesita el fallback completo.
async function triggerRawReprocess(
  body: NonNullable<ReturnType<typeof buildCorrectionReprocessBody>>,
  token: string,
) {
  const { data, error } = await supabase.functions.invoke("run-reprocess", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  const response = (data ?? null) as CorrectionReprocessResponse | null;
  if (error) throw new Error(response?.error
    ? getReprocessFailureMessage(response, response.error)
    : await getFunctionErrorMessage(error));
  if (response?.triggered !== true) {
    throw new Error(getReprocessFailureMessage(
      response,
      "El servicio no confirmó que el beneficio se está reprocesando.",
    ));
  }
  return response;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const srcBadge = "bg-stone-100 text-stone-400 text-[9px] px-1.5 py-0.5 rounded font-medium";
const compactInputCls = `${inputCls} px-2.5 py-1.5 text-xs leading-relaxed`;
const compactSelectCls = `${compactInputCls} cursor-pointer`;
const compactReqCls = `${inputReqCls} px-2.5 py-1.5 text-xs leading-relaxed`;

function Field({ label, isBlocker, source, hint, children }: {
  label: string;
  isBlocker?: boolean;
  source?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`text-xs font-semibold uppercase tracking-wide ${isBlocker ? "text-red-700" : "text-stone-500"}`}>
          {label}
        </label>
        {isBlocker && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-red-700">
            pendiente
          </span>
        )}
        {source && <span className={srcBadge}>{source}</span>}
        {hint && <span className="text-xs text-stone-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function RawField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
        {label} <span className="normal-case font-normal">raw</span>
      </label>
      <div className="min-h-[30px] max-h-24 overflow-auto break-words rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs leading-relaxed text-stone-500">
        {value.trim() ? value : <em className="text-stone-300">sin valor</em>}
      </div>
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-5 flex items-center gap-3 first:mt-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{title}</span>
      <div className="h-px flex-1 bg-stone-100" />
      {action}
    </div>
  );
}

function RedemptionDetailsFields({ method, code, url, onCode, onUrl }: {
  method: string; code: string; url: string;
  onCode: (v: string) => void; onUrl: (v: string) => void;
}) {
  if (!method || ["bin_detection", "membership_validation", "automatic_checkout", "gift_with_purchase", "manual_receipt_upload"].includes(method)) return null;
  if (method === "code" || method === "coupon") {
    return <Field label="Código de descuento"><input className={compactInputCls} onChange={(e) => onCode(e.target.value)} placeholder="ej: RAUKA15" value={code} /></Field>;
  }
  if (method === "qr") {
    return <Field label="URL del QR"><input className={compactInputCls} onChange={(e) => onUrl(e.target.value)} placeholder="https://..." value={url} /></Field>;
  }
  if (method === "app_link" || method === "deep_link") {
    return <Field label="URL de destino"><input className={compactInputCls} onChange={(e) => onUrl(e.target.value)} placeholder="https://..." value={url} /></Field>;
  }
  return null;
}

function BenefitRulesFields({ vals, onChange }: {
  vals: FormState;
  onChange: <K extends keyof FormState>(field: K, val: FormState[K]) => void;
}) {
  const toggleDia = (dia: string) => {
    const current = vals.br_dias_validos;
    const next = current.includes(dia) ? current.filter((d) => d !== dia) : [...current, dia];
    onChange("br_dias_validos", next);
  };

  const setDaysMode = (mode: "all" | "specific") => {
    onChange("br_dias_mode", mode);
    if (mode === "all") {
      onChange("br_dias_validos", []);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Tope ($)" hint="opcional">
          <input className={compactInputCls} min={0} onChange={(e) => onChange("br_max_cap", e.target.value)} placeholder="ej: 5000" type="number" value={vals.br_max_cap} />
        </Field>
        <Field label="Frecuencia" hint="opcional">
          <select className={compactSelectCls} onChange={(e) => onChange("br_frequency", e.target.value)} value={vals.br_frequency}>
            <option value="">Sin frecuencia</option>
            <option value="daily">Diaria</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </Field>
        <Field label="Compra mínima ($)" hint="opcional">
          <input className={compactInputCls} min={0} onChange={(e) => onChange("br_min_compra", e.target.value)} placeholder="ej: 20000" type="number" value={vals.br_min_compra} />
        </Field>
        <Field label="Cuotas mínimas" hint="opcional">
          <input className={compactInputCls} min={0} onChange={(e) => onChange("br_cuotas_minimas", e.target.value)} placeholder="ej: 3" type="number" value={vals.br_cuotas_minimas} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">Días válidos</label>
        <div className="inline-flex w-fit rounded-md border border-stone-200 bg-stone-50 p-0.5">
          {[
            { value: "all", label: "Todos los días" },
            { value: "specific", label: "Días específicos" },
          ].map((option) => (
            <button
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                vals.br_dias_mode === option.value
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800"
              }`}
              key={option.value}
              onClick={() => setDaysMode(option.value as "all" | "specific")}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        {vals.br_dias_mode === "specific" && (
          <div className="flex flex-wrap gap-2">
            {DIAS_OPTIONS.map((dia) => (
              <button
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  vals.br_dias_validos.includes(dia)
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-stone-200 bg-white text-stone-500 hover:border-stone-400"
                }`}
                key={dia}
                onClick={() => toggleDia(dia)}
                type="button"
              >
                {dia}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Clasificacion() {
  const [searchParams] = useSearchParams();
  const rawParam = searchParams.get("raw");
  const { issuers } = useIssuers();
  const [rows, setRows] = useState<RawRow[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>(["needs_review", "failed"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [cardData, setCardData] = useState<Record<string, CardData>>({});
  const [loadingCards, setLoadingCards] = useState<Set<string>>(new Set());
  const [formValues, setFormValues] = useState<Record<string, FormState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [ignoring, setIgnoring] = useState<Set<string>>(new Set());
  const [saveResult, setSaveResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [reprocessResult, setReprocessResult] = useState<Record<string, { loading: boolean; runUrl?: string; error?: string }>>({});
  const [savedToast, setSavedToast] = useState<{
    merchant: string;
    requestId?: string;
    runUrl?: string;
  } | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [userIdentifier, setUserIdentifier] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);

  useEffect(() => {
    if (!rawParam && statusFilters.length === 0) {
      setRows([]); setPageLoading(false); return;
    }
    setPageLoading(true);
    const select = "id, issuer_slug, source_url, raw_payload, scraped_at, processing_status, benefit_id, run_id, publication_blockers";
    const rowsQuery = rawParam
      ? supabase.from("scraped_benefits_raw").select(select).eq("id", rawParam)
      : supabase.from("scraped_benefits_raw")
        .select(`${select}, benefit_ingestion_drafts!inner(draft_status)`)
        .in("benefit_ingestion_drafts.draft_status", statusFilters)
        .order("scraped_at", { ascending: false });
    Promise.all([supabase.auth.getSession(), rowsQuery]).then(([{ data: sessionData }, { data: rowData, error }]) => {
      setUserIdentifier(sessionData.session?.user.email ?? sessionData.session?.user.id ?? null);
      if (error) setPageError(error.message);
      else setRows((rowData ?? []) as RawRow[]);
      setPageLoading(false);
    });
  }, [statusFilters, rawParam]);

  // Auto-select first row when rows load
  useEffect(() => {
    if (rows.length > 0 && !selectedId) {
      const firstRow = rows[0];
      setSelectedId(firstRow.id);
      loadCardData(firstRow);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const loadCardData = async (row: RawRow) => {
    setLoadingCards((prev) => new Set(prev).add(row.id));

    const fallbackCardData: CardData = {
      blockers: [],
      aiConfidence: [],
      aiValues: {},
      existingCorrection: null,
      existingNote: null,
      correctionBaseContentHash: null,
      correctionBaseSchemaVersion: null,
      correctionBaseUpdatedAt: null,
      runId: row.run_id ?? null,
      runError: null,
      runDetails: null,
      draft: null,
      dataMode: "legacy",
    };
    const fallbackForm: FormState = {
      title: String(row.raw_payload?.title ?? row.raw_payload?.name ?? ""),
      description_raw: String(row.raw_payload?.description ?? ""),
      image_url: String(row.raw_payload?.image_url ?? ""),
      category_slug: "",
      channel: "",
      ai_description: "",
      starts_at: "",
      ends_at: "",
      resolve_needs_review: false,
      value_type: "",
      value: "",
      redemption_method: "",
      rd_code: "",
      rd_url: "",
      br_max_cap: "",
      br_frequency: "",
      br_dias_mode: "all",
      br_dias_validos: [],
      br_min_compra: "",
      br_cuotas_minimas: "",
      note: "",
    };

    try {
    const benefitQuery = row.benefit_id
      ? supabase.from("benefits").select("title, description_raw, image_url, channel, ai_description, value_type, value, categories(slug)").eq("id", row.benefit_id).maybeSingle()
      : Promise.resolve({ data: null });

    const [latestRunEventRes, enrichmentEventsRes, correctionRes, benefitRes, ingestionDraftRes] = await Promise.all([
      usePersistedIngestionDrafts
        ? Promise.resolve({ data: null })
        : supabase.from("benefit_processing_events")
        .select("run_id, created_at")
        .eq("raw_benefit_id", row.id)
        .not("run_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      usePersistedIngestionDrafts
        ? Promise.resolve({ data: [] })
        : supabase.from("benefit_processing_events")
        .select("processor, output_payload, run_id, created_at, stage, status, confidence")
        .eq("raw_benefit_id", row.id)
        .eq("stage", "enrichment")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20),
      // select(*) permite leer los metadatos de base cuando PR4 los agregue sin
      // romper el rollout actual, donde esas columnas todavía no existen.
      supabase.from("raw_benefit_corrections").select("*").eq("raw_benefit_id", row.id).maybeSingle(),
      Promise.race([benefitQuery, new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 4000))]),
      usePersistedIngestionDrafts
        ? supabase.from("benefit_ingestion_drafts")
          .select("raw_benefit_id, run_id, benefit_id, source_content_hash, schema_version, normalized_version, draft_status, draft, field_provenance, publication_blockers, updated_at")
          .eq("raw_benefit_id", row.id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const enrichmentEvents = (enrichmentEventsRes.data ?? []) as Array<{
      confidence?: unknown;
      created_at: string;
      output_payload: Record<string, unknown> | null;
      processor: string;
      run_id: string | null;
      stage?: string | null;
      status?: string | null;
    }>;

    if (usePersistedIngestionDrafts && ingestionDraftRes.error) {
      throw new Error(`No se pudo leer el draft persistido: ${ingestionDraftRes.error.message}`);
    }
    const ingestionDraft = ingestionDraftRes.data as IngestionDraft | null;
    const dataMode: CardData["dataMode"] = !ingestionDraft
      ? "legacy"
      : ingestionDraft.schema_version === SUPPORTED_INGESTION_DRAFT_SCHEMA
        ? "persisted"
        : "unsupported";
    const blockers = dataMode === "persisted"
      ? ingestionDraft?.publication_blockers ?? []
      : row.publication_blockers ?? [];
    const b = benefitRes.data as Record<string, unknown> | null;
    const enrichmentOutputs = enrichmentEvents
      .reduce<Record<string, unknown>>((acc, event) => ({ ...acc, ...(event.output_payload ?? {}) }), {});
    const aiConfidence = getLatestAiConfidence(enrichmentEvents);
    const payload = row.raw_payload ?? {};
    const nestedPayload = (payload.raw_payload && typeof payload.raw_payload === "object") ? (payload.raw_payload as Record<string, unknown>) : {};
    const aiValues: AiValues = {
      title: (b?.title as string | null) ?? (payload.title as string | undefined),
      description_raw: (b?.description_raw as string | null) ?? (payload.description as string | undefined) ?? (nestedPayload.description as string | undefined),
      image_url: (b?.image_url as string | null) ?? (payload.image_url as string | undefined),
      category_slug: (b?.categories as { slug?: string } | null)?.slug ?? (enrichmentOutputs.category_slug as string | undefined),
      channel: (b?.channel as string | null) ?? (enrichmentOutputs.channel as string | undefined),
      ai_description: (b?.ai_description as string | null) ?? (enrichmentOutputs.ai_description as string | undefined),
      value_type: (b?.value_type as string | null) ?? (enrichmentOutputs.value_type as string | undefined),
      value: b?.value != null ? String(b.value) : enrichmentOutputs.value != null ? String(enrichmentOutputs.value) : undefined,
    };

    const existing = (correctionRes.data?.corrected_fields as Record<string, unknown> | null) ?? null;
    const existingNote = (correctionRes.data?.note as string | null) ?? null;
    const correctionBaseContentHash = (correctionRes.data?.base_content_hash as string | null) ?? null;
    const correctionBaseSchemaVersion = (correctionRes.data?.base_draft_schema_version as string | null) ?? null;
    const correctionBaseUpdatedAt = (correctionRes.data?.base_draft_updated_at as string | null) ?? null;
    const runId = row.run_id
      ?? (latestRunEventRes.data?.run_id as string | null | undefined)
      ?? null;
    const { data: runDetailsData, error: runDetailsError } = runId
      ? await supabase
        .from("scraper_runs")
        .select("id, issuer_slug, status, items_found, items_inserted, started_at, finished_at")
        .eq("id", runId)
        .maybeSingle()
      : { data: null };
    const runDetails = (runDetailsData as RunDetails | null) ?? null;

    setCardData((prev) => ({
      ...prev,
      [row.id]: {
        blockers,
        aiConfidence,
        aiValues,
        existingCorrection: existing,
        existingNote,
        correctionBaseContentHash,
        correctionBaseSchemaVersion,
        correctionBaseUpdatedAt,
        runId,
        runError: runDetailsError?.message ?? null,
        runDetails,
        draft: ingestionDraft,
        dataMode,
      },
    }));

    const rd = deserializeRedemptionDetails(existing?.redemption_details as Record<string, unknown> | null | undefined);
    const br = deserializeBenefitRules(existing?.benefit_rules as Record<string, unknown> | null | undefined);
    const legacyInitial: FormState = {
      title: String(existing?.title ?? aiValues.title ?? ""),
      description_raw: String(existing?.description_raw ?? aiValues.description_raw ?? ""),
      image_url: String(existing?.image_url ?? aiValues.image_url ?? ""),
      category_slug: String(existing?.category_slug ?? aiValues.category_slug ?? ""),
      channel: String(existing?.channel ?? aiValues.channel ?? ""),
      ai_description: String(existing?.ai_description ?? aiValues.ai_description ?? ""),
      starts_at: "",
      ends_at: "",
      resolve_needs_review: existing?.needs_review === false || blockers.includes("needs_manual_review"),
      value_type: String(existing?.value_type ?? aiValues.value_type ?? ""),
      value: String(existing?.value ?? aiValues.value ?? ""),
      redemption_method: String(existing?.redemption_method ?? ""),
      rd_code: rd.code,
      rd_url: rd.url,
      br_max_cap: br.max_cap,
      br_frequency: br.frequency,
      br_dias_mode: br.dias_mode,
      br_dias_validos: br.dias_validos,
      br_min_compra: br.min_compra,
      br_cuotas_minimas: br.cuotas_minimas,
      note: existingNote ?? "",
    };
    const applicableCorrection = ingestionDraft && dataMode === "persisted"
      ? correctionForDraft(existing, correctionBaseContentHash, correctionBaseSchemaVersion, ingestionDraft)
      : existing;
    const initial = ingestionDraft && dataMode === "persisted"
      ? formFromDraft(ingestionDraft.draft, applicableCorrection, existingNote)
      : legacyInitial;
    setFormValues((prev) => ({ ...prev, [row.id]: initial }));
    } catch {
      setCardData((prev) => ({ ...prev, [row.id]: fallbackCardData }));
      setFormValues((prev) => ({ ...prev, [row.id]: fallbackForm }));
    } finally {
      setLoadingCards((prev) => { const s = new Set(prev); s.delete(row.id); return s; });
    }
  };

  const handleSelect = (row: RawRow) => {
    setSelectedId(row.id);
    setShowRaw(false);
    setShowRun(false);
    setShowOptional(false);
    if (!cardData[row.id]) loadCardData(row);
  };

  const handleNext = () => {
    if (!selectedId) return;
    const idx = rows.findIndex((r) => r.id === selectedId);
    const next = rows[idx + 1];
    if (next) handleSelect(next);
  };

  const removeFromQueue = (rawId: string) => {
    const idx = rows.findIndex((r) => r.id === rawId);
    const nextRow = rows[idx + 1] ?? rows[idx - 1] ?? null;
    setRows((prev) => prev.filter((row) => row.id !== rawId));
    setSelectedId(nextRow?.id ?? null);
    if (nextRow && !cardData[nextRow.id]) loadCardData(nextRow);
  };

  const clearReprocessResult = (rawId: string) => {
    setReprocessResult((prev) => {
      if (!(rawId in prev)) return prev;
      const next = { ...prev };
      delete next[rawId];
      return next;
    });
  };

  const setField = <K extends keyof FormState>(rawId: string, field: K, val: FormState[K]) => {
    setFormValues((prev) => ({ ...prev, [rawId]: { ...prev[rawId], [field]: val } }));
  };

  const handleIgnoreRaw = async (row: RawRow) => {
    if (row.processing_status === "ignored") return;

    const confirmed = window.confirm("¿Ignorar este raw? Se marcará como no-beneficio y saldrá de la cola de clasificación.");
    if (!confirmed) return;

    setIgnoring((prev) => new Set(prev).add(row.id));
    // La cola se filtra por benefit_ingestion_drafts.draft_status, que solo puede
    // escribirse vía este RPC (RLS no da UPDATE directo al browser sobre esa tabla).
    // Mirrorea el mismo draft_status + processing_status que usa el pipeline.
    const { error } = await supabase.rpc("mark_ingestion_draft_ignored", { p_raw_benefit_id: row.id });
    setIgnoring((prev) => { const s = new Set(prev); s.delete(row.id); return s; });

    if (error) {
      setSaveResult((prev) => ({ ...prev, [row.id]: { ok: false, msg: `No se pudo ignorar el raw: ${error.message}` } }));
      return;
    }

    setSaveResult((prev) => ({ ...prev, [row.id]: { ok: true, msg: "Raw ignorado." } }));
    if (statusFilters.includes("ignored")) {
      setRows((prev) => prev.map((current) => current.id === row.id ? { ...current, processing_status: "ignored", publication_blockers: [] } : current));
    } else {
      removeFromQueue(row.id);
    }
  };

  const handleSave = async (rawId: string) => {
    setSavedToast(null);
    try {
      clearReprocessResult(rawId);
      const vals = formValues[rawId];
      if (!vals) {
        setSaveResult((prev) => ({ ...prev, [rawId]: { ok: false, msg: "Datos todavía no disponibles. Espera a que cargue la ficha." } }));
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const correctedBy = sessionData.session?.user.email ?? sessionData.session?.user.id ?? userIdentifier;
      if (!correctedBy) {
        setSaveResult((prev) => ({ ...prev, [rawId]: { ok: false, msg: "Sesión no disponible. Recarga la página." } }));
        return;
      }

      const currentBlockers = cardData[rawId]?.blockers ?? [];
      const unresolvedBeforeSave = getUnresolvedCorrectionBlockers(currentBlockers, vals);
      if (unresolvedBeforeSave.length > 0) {
        const labels = unresolvedBeforeSave.map((b) => BLOCKER_LABELS[b] ?? b).join(", ");
        setSaveResult((prev) => ({
          ...prev,
          [rawId]: { ok: false, msg: `Completa lo necesario antes de guardar: ${labels}.` },
        }));
        return;
      }

      const cf: Record<string, unknown> = {};
      if (vals.title.trim()) cf.title = vals.title.trim();
      if (vals.description_raw.trim()) cf.description_raw = vals.description_raw.trim();
      else if (vals.ai_description.trim() && cardData[rawId]?.blockers.includes("description_missing")) {
        cf.description_raw = vals.ai_description.trim();
      }
      if (vals.image_url.trim()) cf.image_url = vals.image_url.trim();
      if (vals.category_slug) cf.category_slug = vals.category_slug;
      if (vals.channel) cf.channel = vals.channel;
      if (vals.ai_description.trim()) cf.ai_description = vals.ai_description.trim();
      if (vals.starts_at) cf.starts_at = vals.starts_at;
      if (vals.ends_at) cf.ends_at = vals.ends_at;
      const persistedDraft = cardData[rawId]?.dataMode === "persisted" ? cardData[rawId]?.draft : null;
      const rawWasWaitingForReview = rows.find((row) => row.id === rawId)?.processing_status === "needs_review";
      if (vals.resolve_needs_review || (!persistedDraft && rawWasWaitingForReview)) cf.needs_review = false;
      if (vals.value_type) cf.value_type = vals.value_type;
      const parsedValue = Number(vals.value);
      if (vals.value.trim() && Number.isFinite(parsedValue)) cf.value = parsedValue;
      if (vals.redemption_method) cf.redemption_method = vals.redemption_method;
      const rd = serializeRedemptionDetails(vals.redemption_method, vals.rd_code, vals.rd_url);
      if (rd) cf.redemption_details = rd;
      const br = serializeBenefitRules(vals);
      if (br) cf.benefit_rules = br;

      // En modo canónico sólo persisten overrides reales. Serializar el formulario
      // completo convertiría cada campo del draft en una corrección manual permanente.
      if (persistedDraft) {
        const draftForm = formFromDraft(persistedDraft.draft, null, null);
        const draftRules = serializeBenefitRules(draftForm);
        if (!sameCorrectionValue(br, draftRules)) {
          const mergedRules = {
            ...((persistedDraft.draft.benefit_rules as Record<string, unknown> | null) ?? {}),
          };
          for (const field of ["max_cap", "frequency", "days", "min_purchase", "installments_count"]) {
            delete mergedRules[field];
          }
          Object.assign(mergedRules, br ?? {});
          cf.benefit_rules = mergedRules;
        } else {
          delete cf.benefit_rules;
        }

        const draftRedemption = serializeRedemptionDetails(
          draftForm.redemption_method,
          draftForm.rd_code,
          draftForm.rd_url,
        );
        if (!sameCorrectionValue(rd, draftRedemption)) {
          const methodChanged = vals.redemption_method !== draftForm.redemption_method;
          const mergedRedemption = methodChanged
            ? { ...(rd ?? {}) }
            : {
                ...((persistedDraft.draft.redemption_details as Record<string, unknown> | null) ?? {}),
                ...(rd ?? {}),
              };
          for (const field of ["code", "url", "qr_url"]) {
            if (!rd || !Object.prototype.hasOwnProperty.call(rd, field)) delete mergedRedemption[field];
          }
          cf.redemption_details = mergedRedemption;
        } else {
          delete cf.redemption_details;
        }

        if (!vals.starts_at && persistedDraft.draft.starts_at) cf.starts_at = null;
        if (!vals.ends_at && persistedDraft.draft.ends_at) cf.ends_at = null;
        for (const field of Object.keys(cf)) {
          if (field === "benefit_rules" || field === "redemption_details") continue;
          if (sameCorrectionValue(cf[field], persistedDraft.draft[field])) delete cf[field];
        }
      }

      setSaving((prev) => new Set(prev).add(rawId));
      const { data: savedCorrection, error } = await supabase
        .from("raw_benefit_corrections")
        .upsert(
          {
            raw_benefit_id: rawId,
            corrected_fields: cf,
            corrected_by: correctedBy,
            note: vals.note.trim() || null,
            ...(persistedDraft ? {
              base_content_hash: persistedDraft.source_content_hash,
              base_draft_schema_version: persistedDraft.schema_version,
              base_draft_updated_at: persistedDraft.updated_at,
            } : {}),
          },
          { onConflict: "raw_benefit_id" },
        )
        .select("corrected_fields")
        .single();

      if (error) {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
        setSaveResult((prev) => ({ ...prev, [rawId]: { ok: false, msg: error.message } }));
        return;
      }

      setSaveResult((prev) => ({ ...prev, [rawId]: { ok: true, msg: "Corrección guardada. Solicitando reproceso…" } }));

      const savingRow = rows.find((r) => r.id === rawId);
      const forceReprocess = savingRow?.processing_status === "published";
      const persistedCorrectedFields = savedCorrection.corrected_fields as Record<string, unknown>;
      const savedFields = getChangedCorrectionFields(
        cardData[rawId]?.existingCorrection ?? null,
        persistedCorrectedFields,
      );
      const reprocessBody = buildCorrectionReprocessBody(rawId, savedFields, forceReprocess);
      if (!reprocessBody) {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
        setSaveResult((prev) => ({
          ...prev,
          [rawId]: { ok: true, msg: "Nota guardada. No cambió ningún campo del beneficio, por lo que no se inició un reproceso." },
        }));
        return;
      }

      setReprocessResult((prev) => ({ ...prev, [rawId]: { loading: true } }));

      const token = await getFreshAccessToken();
      if (!token) {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
        setReprocessResult((prev) => ({ ...prev, [rawId]: { loading: false, error: "Sesión vencida. Recarga la página e intenta de nuevo." } }));
        return;
      }

      const savingPayload = savingRow?.raw_payload ?? {};
      const savingMerchant = String(
        savingPayload.merchant_name ?? savingPayload.merchant ?? savingPayload.title ?? savingPayload.name ?? savingRow?.source_url ?? "beneficio",
      );

      try {
        const runData = await triggerRawReprocess(reprocessBody, token);
        setSavedToast({
          merchant: savingMerchant,
          requestId: runData.requestId,
          runUrl: runData.runUrl,
        });
        removeFromQueue(rawId);
      } catch (reprocessError) {
        setReprocessResult((prev) => ({
          ...prev,
          [rawId]: {
            loading: false,
            error: reprocessError instanceof Error ? reprocessError.message : String(reprocessError),
          },
        }));
      } finally {
        setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
      }
    } catch (err) {
      setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });
      clearReprocessResult(rawId);
      setSaveResult((prev) => ({
        ...prev,
        [rawId]: { ok: false, msg: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` },
      }));
    }
  };

  // ─── Selected row derived state ─────────────────────────────────────────────

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const data = selectedId ? cardData[selectedId] : null;
  const vals = selectedId ? formValues[selectedId] : null;
  const isLoadingCard = selectedId ? loadingCards.has(selectedId) : false;
  const isSaving = selectedId ? saving.has(selectedId) : false;
  const isIgnoring = selectedId ? ignoring.has(selectedId) : false;
  const result = selectedId ? saveResult[selectedId] : undefined;
  const selectedReprocess = selectedId ? reprocessResult[selectedId] : undefined;

  const blockerFields = new Set(
    (data?.blockers ?? []).map((b) => BLOCKER_FIELD_MAP[b]).filter(Boolean),
  );
  const descriptionIsBlocker = blockerFields.has("description_raw") || blockerFields.has("ai_description");

  const unresolvedBlockers = getUnresolvedCorrectionBlockers(data?.blockers ?? [], vals);

  const correctedFields = data?.existingCorrection ?? null;
  const unresolvedLabels = unresolvedBlockers.map((b) => BLOCKER_LABELS[b] ?? b);
  const aiConfidence = data?.aiConfidence ?? [];
  const rulesConfidence = aiConfidence.find((item) => item.processor === "benefit_rules_extraction");
  const reviewReasons = Array.from(new Set((data?.blockers ?? []).flatMap((blocker) => {
    if (blocker === "needs_manual_review" && rulesConfidence) {
      const reason = `La confianza de la extracción de reglas fue ${formatConfidence(rulesConfidence.confidence)}; para pasar sin revisión manual debe ser al menos ${formatConfidence(RULES_REVIEW_CONFIDENCE_THRESHOLD)}.`;
      return rulesConfidence.reason ? `${reason} ${rulesConfidence.reason}` : reason;
    }
    return REVIEW_REASON_BY_BLOCKER[blocker] ?? `Falta resolver: ${BLOCKER_LABELS[blocker] ?? blocker}.`;
  })));
  const canSaveCorrection = !!vals && !!data && data.dataMode !== "unsupported" && unresolvedBlockers.length === 0;

  const sourceFor = (field: keyof FormState, aiValue?: string, rawValue?: unknown) => {
    if (!vals) return undefined;
    const correctionField = field === "resolve_needs_review" ? "needs_review" : field;
    if (data?.dataMode === "persisted" && data.draft && !hasOwnValue(correctedFields, correctionField)) {
      const persistedSource = formatProvenance(data.draft.field_provenance?.[correctionField]);
      if (persistedSource) return persistedSource;
    }
    return getCurrentValueSource({ aiValue, correctedFields, currentValue: vals[field] as string | boolean, field, rawValue });
  };

  const payload = selectedRow?.raw_payload ?? {};
  const rawTitle = String(payload.title ?? payload.name ?? selectedRow?.source_url ?? selectedRow?.id ?? "");
  const rawDescription = String(payload.description_raw ?? payload.description ?? "");
  const rawImageUrl = String(payload.image_url ?? payload.merchant_image_url ?? "");
  const rawMerchant = String(payload.merchant_name ?? payload.merchant ?? "");
  const headerMerchant = String(
    data?.dataMode === "persisted" ? data.draft?.draft.merchant_name : rawMerchant,
  ).trim() || vals?.title || rawTitle;
  const rawCategory = String(payload.category ?? payload.category_slug ?? "");
  const rawChannel = String(payload.channel ?? payload.modality ?? "");
  const rawValue = String(payload.value ?? payload.discount ?? payload.benefit ?? "");
  const hasOptionalValues = !!vals && (
    [
      vals.value_type,
      vals.value,
      vals.redemption_method,
      vals.rd_code,
      vals.rd_url,
      vals.br_max_cap,
      vals.br_frequency,
      vals.br_min_compra,
      vals.br_cuotas_minimas,
      vals.note,
    ].some((value) => value.trim()) || vals.br_dias_validos.length > 0
  );

  const selectedIdx = rows.findIndex((r) => r.id === selectedId);
  const issuerNameBySlug = new Map(issuers.map((issuer) => [issuer.slug, issuer.name]));

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">

      {/* ── Queue (left) ── */}
      <div className="w-64 shrink-0 border-r border-stone-200 bg-stone-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-stone-200 bg-stone-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Cola</span>
            <span className="text-[11px] text-stone-400">{rows.length}</span>
          </div>
          {/* Status filters */}
          <div className="flex flex-wrap gap-1">
            {["needs_review", "failed", "ignored"].map((status) => (
              <button
                className={`rounded px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                  statusFilters.includes(status)
                    ? "bg-stone-900 text-white border-stone-900"
                    : "border-stone-200 text-stone-400 hover:border-stone-400"
                }`}
                key={status}
                onClick={() => setStatusFilters((prev) => prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status])}
                type="button"
              >
                {status === "needs_review" ? "review" : status}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {pageLoading && (
            <p className="px-4 py-4 text-xs text-stone-400">Cargando…</p>
          )}
          {pageError && (
            <p className="px-4 py-4 text-xs text-stone-500">{pageError}</p>
          )}
          {!pageLoading && !pageError && rows.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-stone-400">Sin beneficios por clasificar</p>
          )}
          {rows.map((row) => {
            const rowPayload = row.raw_payload ?? {};
            const rowTitle = String(rowPayload.title ?? rowPayload.name ?? row.source_url ?? row.id);
            const rowMerchant = String(rowPayload.merchant_name ?? rowPayload.merchant ?? rowPayload.store_name ?? rowTitle);
            const issuerName = row.issuer_slug ? issuerNameBySlug.get(row.issuer_slug) ?? row.issuer_slug : "";
            const rowData = cardData[row.id];
            const isSelected = row.id === selectedId;
            const rowBlockers = rowData?.blockers.length ? rowData.blockers : row.publication_blockers ?? [];
            const rowTags = rowBlockers.length
              ? rowBlockers.map((b) => BLOCKER_LABELS[b] ?? b)
              : row.processing_status ? [row.processing_status === "needs_review" ? "needs review" : row.processing_status] : [];
            return (
              <div
                className={`px-4 py-2.5 border-b border-stone-200 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-stone-200 border-l-2 border-l-stone-500 pl-[14px]"
                    : "hover:bg-stone-150 hover:bg-stone-200/50"
                }`}
                key={row.id}
                onClick={() => handleSelect(row)}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className={`text-[12.5px] font-medium leading-snug truncate ${isSelected ? "text-stone-900" : "text-stone-700"}`}>{rowMerchant}</span>
                  <span className="max-w-[86px] shrink-0 truncate text-right text-[10px] text-stone-400">{issuerName}</span>
                </div>
                {rowTags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {rowTags.slice(0, 3).map((tag) => (
                      <span
                        className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none text-stone-500"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                    {rowTags.length > 3 && (
                      <span className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none text-stone-400">
                        +{rowTags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Editor (right) ── */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden bg-white">
        {savedToast && (
          <div className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-8 py-2.5 flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-emerald-800">
              ✓ <span className="font-semibold">{savedToast.merchant}</span> guardado — reproceso iniciado
              {savedToast.runUrl && (
                <> · <a className="underline" href={savedToast.runUrl} rel="noreferrer" target="_blank">Ver en GitHub Actions →</a></>
              )}
              {savedToast.requestId && <> · referencia <code>{savedToast.requestId}</code></>}
            </span>
            <button
              className="text-emerald-600 hover:text-emerald-800 text-lg leading-none"
              onClick={() => setSavedToast(null)}
              type="button"
            >
              ×
            </button>
          </div>
        )}

        {!selectedRow ? (
          <div className="flex-1 flex items-center justify-center text-stone-300 text-sm">
            Seleccioná un beneficio de la cola
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-8 pt-5 pb-4 border-b border-stone-200 shrink-0">
              <div className="text-[11px] text-stone-400 mb-1.5">
                Clasificación
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-semibold text-stone-900 leading-snug mb-2 truncate">
                    {headerMerchant}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedRow.issuer_slug && (
                      <span className="bg-stone-100 text-stone-500 border border-stone-200 text-[10px] px-2 py-0.5 rounded font-medium">
                        {selectedRow.issuer_slug}
                      </span>
                    )}
                    <span className="bg-stone-100 text-stone-500 border border-stone-200 text-[10px] px-2 py-0.5 rounded font-medium">
                      {selectedRow.processing_status ?? "—"}
                    </span>
                    {unresolvedBlockers.length > 0 && (
                      <span className="bg-stone-100 text-stone-500 border border-stone-200 text-[10px] px-2 py-0.5 rounded font-medium">
                        {unresolvedBlockers.length} sin completar
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <button
                    className="bg-stone-900 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-stone-800 disabled:opacity-50 transition-colors"
                    disabled={isSaving || isIgnoring || !canSaveCorrection}
                    onClick={() => selectedId && handleSave(selectedId)}
                    title={!canSaveCorrection && unresolvedLabels.length > 0 ? `Completa: ${unresolvedLabels.join(", ")}` : undefined}
                    type="button"
                  >
                    {isSaving ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    className="border border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 disabled:opacity-40 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                    disabled={isSaving || isIgnoring || selectedRow.processing_status === "ignored"}
                    onClick={() => handleIgnoreRaw(selectedRow)}
                    type="button"
                  >
                    {isIgnoring ? "Ignorando…" : "Descartar"}
                  </button>
                  <button
                    className="border border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-800 disabled:opacity-40 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                    disabled={!data?.runId}
                    onClick={() => setShowRun((v) => !v)}
                    type="button"
                  >
                    {showRun ? "Ocultar run" : "Ver run"}
                  </button>
                  <button
                    className="border border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-800 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                    onClick={() => setShowRaw((v) => !v)}
                    type="button"
                  >
                    {showRaw ? "Ocultar raw" : "Ver raw"}
                  </button>
                  {selectedRow.source_url && (
                    <a
                      className="border border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-800 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                      href={selectedRow.source_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Fuente →
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-8 py-5">
              {isLoadingCard ? (
                <p className="text-sm text-stone-400">Cargando datos…</p>
              ) : (
                <>
                  {/* Raw JSON */}
                  {showRun && data?.runId && (
                    <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-semibold text-stone-800">Run {data.runId.slice(0, 8)}</span>
                        <span className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-medium text-stone-500">
                          {data.runDetails?.status ?? "sin detalle"}
                        </span>
                      </div>
                      {data.runDetails ? (
                      <>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Issuer</p>
                          <p>{data.runDetails.issuer_slug ? issuerNameBySlug.get(data.runDetails.issuer_slug) ?? data.runDetails.issuer_slug : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Encontrados</p>
                          <p>{data.runDetails.items_found ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Publicados</p>
                          <p>{data.runDetails.items_inserted ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Inicio</p>
                          <p>{formatDateTime(data.runDetails.started_at)}</p>
                        </div>
                      </div>
                      {data.runDetails.finished_at && (
                        <p className="mt-2 text-stone-500">Terminó: {formatDateTime(data.runDetails.finished_at)}</p>
                      )}
                      </>
                      ) : (
                        <p className="text-stone-500">
                          {data.runError ? `No se pudo cargar scraper_runs: ${data.runError}` : "No se encontró detalle en scraper_runs para este run."}
                        </p>
                      )}
                    </div>
                  )}

                  {showRaw && (
                    <pre className="mb-5 max-h-60 overflow-auto rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-500">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  )}

                  {vals && (
                    <div className="flex flex-col gap-0">
                      {data?.dataMode === "unsupported" && data.draft ? (
                        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                          El draft usa el schema {data.draft.schema_version}, que esta versión del backoffice no soporta. La edición está bloqueada hasta actualizar el cliente.
                        </div>
                      ) : data?.dataMode === "persisted" && data.draft ? (
                        <div className="mb-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span><strong>Draft canónico</strong> · {data.draft.draft_status}</span>
                            <span>actualizado {formatDateTime(data.draft.updated_at)}</span>
                            <span>schema {data.draft.schema_version}</span>
                            {data.draft.normalized_version && <span>normalizador {data.draft.normalized_version}</span>}
                          </div>
                          {data.correctionBaseContentHash && data.correctionBaseContentHash !== data.draft.source_content_hash && (
                            <p className="mt-2 text-amber-800">La corrección fue creada sobre un raw anterior y puede requerir revisión.</p>
                          )}
                          {data.correctionBaseSchemaVersion && data.correctionBaseSchemaVersion !== data.draft.schema_version && (
                            <p className="mt-1 text-amber-800">La corrección usa el schema {data.correctionBaseSchemaVersion}; el draft actual usa {data.draft.schema_version}.</p>
                          )}
                          {data.correctionBaseUpdatedAt && (
                            <p className="mt-1 text-stone-500">Corrección basada en draft de {formatDateTime(data.correctionBaseUpdatedAt)}.</p>
                          )}
                        </div>
                      ) : usePersistedIngestionDrafts ? (
                        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          No existe un draft persistido para este raw. Se muestran datos legacy temporalmente; no son un snapshot canónico.
                        </div>
                      ) : (
                        <div className="mb-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                          Modo legacy activo: los valores se reconstruyen temporalmente desde el pipeline anterior.
                        </div>
                      )}
                      {(reviewReasons.length > 0 || aiConfidence.length > 0) && (
                        <div className="mb-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                          {reviewReasons.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Razón de revisión</p>
                              <p className="mt-1">{reviewReasons.join(" ")}</p>
                            </div>
                          )}
                          {aiConfidence.length > 0 && (
                            <div className={reviewReasons.length > 0 ? "mt-2" : ""}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Confianza por tarea IA</p>
                              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                {aiConfidence.map((item) => (
                                  <div className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5" key={item.processor}>
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-xs font-medium text-stone-700">{item.label}</span>
                                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                        item.confidence != null && item.confidence < LOW_CONFIDENCE_THRESHOLD
                                          ? "bg-amber-50 text-amber-700"
                                          : "bg-stone-100 text-stone-500"
                                      }`}>
                                        {formatConfidence(item.confidence)}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[11px] leading-relaxed text-stone-400">{item.description}</p>
                                    {item.reason && (
                                      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{item.reason}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <SectionTitle title="Entrada recibida" />

                      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div className="lg:col-span-2">
                          <RawField label="Título" value={rawTitle} />
                        </div>
                        <RawField label="Merchant" value={rawMerchant} />
                        <RawField label="Categoría" value={rawCategory} />
                        <RawField label="Canal" value={rawChannel} />
                        <RawField label="Valor" value={rawValue} />
                        <div className="lg:col-span-2">
                          <RawField label="Imagen" value={rawImageUrl} />
                        </div>
                        <div className="col-span-2 lg:col-span-4">
                          <RawField label="Descripción" value={rawDescription} />
                        </div>
                      </div>

                      <SectionTitle title="Output publicable" />

                      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div className="col-span-2">
                        <Field label="Título" isBlocker={blockerFields.has("title")} source={sourceFor("title", undefined, payload.title ?? payload.name)}>
                          <input
                            className={blockerFields.has("title") && !vals.title.trim() ? compactReqCls : compactInputCls}
                            onChange={(e) => setField(selectedRow.id, "title", e.target.value)}
                            placeholder="Título del beneficio"
                            value={vals.title}
                          />
                          {blockerFields.has("title") && !vals.title.trim() && (
                            <p className="text-[10px] text-red-700">necesario para publicar</p>
                          )}
                        </Field>
                        </div>
                        <Field label="Categoría" isBlocker={blockerFields.has("category_slug")} source={sourceFor("category_slug", data?.aiValues.category_slug, payload.category)}>
                          <select
                            className={blockerFields.has("category_slug") && !vals.category_slug ? `${compactReqCls} cursor-pointer` : compactSelectCls}
                            onChange={(e) => setField(selectedRow.id, "category_slug", e.target.value)}
                            value={vals.category_slug}
                          >
                            {CATEGORY_SLUG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {blockerFields.has("category_slug") && !vals.category_slug && (
                            <p className="text-[10px] text-red-700">necesaria para publicar</p>
                          )}
                        </Field>
                        <Field label="Canal" isBlocker={blockerFields.has("channel")} source={sourceFor("channel", data?.aiValues.channel, payload.channel)}>
                          <select
                            className={blockerFields.has("channel") && !vals.channel ? `${compactReqCls} cursor-pointer` : compactSelectCls}
                            onChange={(e) => setField(selectedRow.id, "channel", e.target.value)}
                            value={vals.channel}
                          >
                            {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {blockerFields.has("channel") && !vals.channel && (
                            <p className="text-[10px] text-red-700">necesario para publicar</p>
                          )}
                        </Field>
                        <div className="col-span-2 lg:col-span-3">
                          <Field label="Imagen" isBlocker={blockerFields.has("image_url")} source={sourceFor("image_url", undefined, payload.image_url ?? payload.merchant_image_url)}>
                            <input
                              className={blockerFields.has("image_url") && !vals.image_url.trim() ? compactReqCls : compactInputCls}
                              onChange={(e) => setField(selectedRow.id, "image_url", e.target.value)}
                              placeholder="https://..."
                              value={vals.image_url}
                            />
                            {blockerFields.has("image_url") && !vals.image_url.trim() && (
                              <p className="text-[10px] text-red-700">necesaria para publicar</p>
                            )}
                          </Field>
                        </div>
                        {vals.image_url.trim() && (
                          <img alt="" className="h-[70px] w-full rounded-md border border-stone-100 object-cover" src={vals.image_url.trim()} />
                        )}
                        <div className="col-span-2">
                          <Field
                            label="Descripción"
                            source={sourceFor("ai_description", data?.aiValues.ai_description)}
                            isBlocker={descriptionIsBlocker}
                            hint="máx. 150 chars"
                          >
                            <textarea
                              className={`${descriptionIsBlocker && !vals.ai_description.trim() ? compactReqCls : compactInputCls} min-h-20 resize-y`}
                              maxLength={150}
                              onChange={(e) => setField(selectedRow.id, "ai_description", e.target.value)}
                              placeholder="Descripción corta visible para el usuario"
                              value={vals.ai_description}
                            />
                            <p className="text-right text-[10px] text-stone-400">{vals.ai_description.length}/150</p>
                            {descriptionIsBlocker && !vals.ai_description.trim() && (
                              <p className="text-[10px] text-red-700">necesaria para publicar</p>
                            )}
                          </Field>
                        </div>
                        <Field label="Inicio" source={sourceFor("starts_at")}>
                          <input className={compactInputCls} onChange={(e) => setField(selectedRow.id, "starts_at", e.target.value)} type="date" value={vals.starts_at} />
                        </Field>
                        <Field label="Término" source={sourceFor("ends_at")}>
                          <input className={compactInputCls} onChange={(e) => setField(selectedRow.id, "ends_at", e.target.value)} type="date" value={vals.ends_at} />
                        </Field>
                      </div>

                      <SectionTitle
                        title="Detalles opcionales"
                        action={
                          <button
                            className="rounded border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-500 hover:border-stone-400 hover:text-stone-800"
                            onClick={() => setShowOptional((value) => !value)}
                            type="button"
                          >
                            {showOptional ? "Ocultar" : hasOptionalValues ? "Ver datos guardados" : "Agregar"}
                          </button>
                        }
                      />

                      {showOptional && (
                      <>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <Field label="Tipo de valor" source={sourceFor("value_type", data?.aiValues.value_type, payload.value_type)}>
                          <select className={compactSelectCls} onChange={(e) => setField(selectedRow.id, "value_type", e.target.value)} value={vals.value_type}>
                            {VALUE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </Field>
                        <Field label="Valor" hint="ej: 15 para 15%" source={sourceFor("value", data?.aiValues.value, payload.value)}>
                          <input className={compactInputCls} onChange={(e) => setField(selectedRow.id, "value", e.target.value)} placeholder="ej: 15" step="any" type="number" value={vals.value} />
                        </Field>
                        <Field label="Método de canje">
                          <select className={compactSelectCls} onChange={(e) => setField(selectedRow.id, "redemption_method", e.target.value)} value={vals.redemption_method}>
                            {REDEMPTION_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </Field>
                        <RedemptionDetailsFields
                          code={vals.rd_code}
                          method={vals.redemption_method}
                          onCode={(v) => setField(selectedRow.id, "rd_code", v)}
                          onUrl={(v) => setField(selectedRow.id, "rd_url", v)}
                          url={vals.rd_url}
                        />
                      </div>

                      <div className="rounded-lg border border-stone-200 p-4 mb-3">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Reglas del beneficio</p>
                        <BenefitRulesFields onChange={(field, val) => setField(selectedRow.id, field, val)} vals={vals} />
                      </div>

                      <Field label="Nota interna">
                        <textarea
                          className={`${compactInputCls} min-h-12 resize-y mb-3`}
                          onChange={(e) => setField(selectedRow.id, "note", e.target.value)}
                          placeholder="Comentario para el equipo — no se publica…"
                          value={vals.note}
                        />
                      </Field>
                      </>
                      )}

                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bottom bar */}
            <div className="shrink-0 border-t border-stone-200 bg-white px-8 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 text-xs">
                {selectedReprocess?.loading ? (
                  <span className="text-stone-500">Guardando y solicitando reproceso…</span>
                ) : selectedReprocess?.error ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 font-medium text-red-800">
                    Corrección guardada, pero el reproceso falló: {selectedReprocess.error}
                  </span>
                ) : result && !result.ok ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 font-medium text-red-800">
                    {result.msg}
                  </span>
                ) : (
                  <span className="text-stone-400">
                    {selectedId && data && unresolvedBlockers.length === 0 ? "Listo para guardar" : ""}
                  </span>
                )}
              </div>
              <div className="flex gap-2 items-center">
                {selectedIdx < rows.length - 1 && (
                  <button
                    className="border border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-800 text-sm font-medium px-4 py-1.5 rounded-md transition-colors"
                    onClick={handleNext}
                    type="button"
                  >
                    Siguiente →
                  </button>
                )}
                <button
                  className="bg-stone-900 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-stone-800 disabled:opacity-50 transition-colors"
                  disabled={isSaving || isIgnoring || !canSaveCorrection}
                  onClick={() => selectedId && handleSave(selectedId)}
                  title={!canSaveCorrection && unresolvedLabels.length > 0 ? `Completa: ${unresolvedLabels.join(", ")}` : undefined}
                  type="button"
                >
                  {isSaving ? "Guardando y reprocesando…" : "Guardar"}
                </button>
                <button
                  className="border border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 disabled:opacity-40 text-sm font-medium px-4 py-1.5 rounded-md transition-colors"
                  disabled={isSaving || isIgnoring || selectedRow.processing_status === "ignored"}
                  onClick={() => handleIgnoreRaw(selectedRow)}
                  type="button"
                >
                  {isIgnoring ? "Ignorando…" : "Descartar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
