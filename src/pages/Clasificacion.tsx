import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { inputCls, inputReqCls, selectCls } from "../lib/styles";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = {
  id: string;
  issuer_slug: string | null;
  source_url: string | null;
  raw_payload: Record<string, unknown> | null;
  scraped_at: string | null;
  processing_status: string | null;
  benefit_id: string | null;
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

type CardData = {
  blockers: string[];
  aiValues: AiValues;
  existingCorrection: Record<string, unknown> | null;
  existingNote: string | null;
};

type FormState = {
  title: string;
  description_raw: string;
  image_url: string;
  category_slug: string;
  channel: string;
  ai_description: string;
  resolve_needs_review: boolean;
  value_type: string;
  value: string;
  redemption_method: string;
  rd_code: string;
  rd_url: string;
  br_tope_mensual: string;
  br_tope_diario: string;
  br_dias_validos: string[];
  br_min_compra: string;
  br_cuotas_minimas: string;
  note: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_SLUG_OPTIONS = [
  { value: "", label: "— seleccionar —" },
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
  { value: "", label: "— seleccionar —" },
  { value: "online", label: "Online" },
  { value: "physical", label: "Físico" },
  { value: "hybrid", label: "Híbrido" },
];

const VALUE_TYPE_OPTIONS = [
  { value: "", label: "— sin tipo —" },
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
  { value: "", label: "— sin método —" },
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
  merchant_id_missing: "Sin merchant",
  merchant_name_missing: "Sin nombre de merchant",
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
  if (vals.br_tope_mensual.trim()) rules.tope_mensual = Number(vals.br_tope_mensual);
  if (vals.br_tope_diario.trim()) rules.tope_diario = Number(vals.br_tope_diario);
  if (vals.br_dias_validos.length) rules.dias_validos = vals.br_dias_validos;
  if (vals.br_min_compra.trim()) rules.min_compra = Number(vals.br_min_compra);
  if (vals.br_cuotas_minimas.trim()) rules.cuotas_minimas = Number(vals.br_cuotas_minimas);
  return Object.keys(rules).length ? rules : null;
}

function deserializeBenefitRules(br: Record<string, unknown> | null | undefined) {
  if (!br) return { tope_mensual: "", tope_diario: "", dias_validos: [] as string[], min_compra: "", cuotas_minimas: "" };
  return {
    tope_mensual: br.tope_mensual != null ? String(br.tope_mensual) : "",
    tope_diario: br.tope_diario != null ? String(br.tope_diario) : "",
    dias_validos: Array.isArray(br.dias_validos) ? (br.dias_validos as string[]) : [],
    min_compra: br.min_compra != null ? String(br.min_compra) : "",
    cuotas_minimas: br.cuotas_minimas != null ? String(br.cuotas_minimas) : "",
  };
}

function hasOwnValue(source: Record<string, unknown> | null | undefined, key: string) {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

function hasTextValue(value: unknown) {
  return value != null && String(value).trim() !== "";
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const srcBadge = "bg-stone-100 text-stone-400 text-[9px] px-1.5 py-0.5 rounded font-medium";

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
        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {label}
          {isBlocker && <span className="ml-1 text-stone-400">·</span>}
        </label>
        {source && <span className={srcBadge}>{source}</span>}
        {hint && <span className="text-xs text-stone-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function RawField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        {label} <span className="normal-case font-normal">raw</span>
      </label>
      <div className="rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-400 min-h-[34px] leading-relaxed">
        {value.trim() ? value : <em className="text-stone-300">sin valor</em>}
      </div>
    </div>
  );
}

function FieldPair({ label, rawValue, source, isBlocker, hint, children }: {
  label: string;
  rawValue: string;
  source?: string;
  isBlocker?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_28px_1fr] mb-3 items-start">
      <RawField label={label} value={rawValue} />
      <div className="flex items-center justify-center pt-6 text-stone-300 text-sm">→</div>
      <Field label={label} isBlocker={isBlocker} source={source} hint={hint}>
        {children}
      </Field>
    </div>
  );
}

function RedemptionDetailsFields({ method, code, url, onCode, onUrl }: {
  method: string; code: string; url: string;
  onCode: (v: string) => void; onUrl: (v: string) => void;
}) {
  if (!method || ["bin_detection", "membership_validation", "automatic_checkout", "gift_with_purchase", "manual_receipt_upload"].includes(method)) return null;
  if (method === "code" || method === "coupon") {
    return <Field label="Código de descuento"><input className={inputCls} onChange={(e) => onCode(e.target.value)} placeholder="ej: RAUKA15" value={code} /></Field>;
  }
  if (method === "qr") {
    return <Field label="URL del QR"><input className={inputCls} onChange={(e) => onUrl(e.target.value)} placeholder="https://..." value={url} /></Field>;
  }
  if (method === "app_link" || method === "deep_link") {
    return <Field label="URL de destino"><input className={inputCls} onChange={(e) => onUrl(e.target.value)} placeholder="https://..." value={url} /></Field>;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Tope mensual ($)" hint="opcional">
          <input className={inputCls} min={0} onChange={(e) => onChange("br_tope_mensual", e.target.value)} placeholder="ej: 5000" type="number" value={vals.br_tope_mensual} />
        </Field>
        <Field label="Tope diario ($)" hint="opcional">
          <input className={inputCls} min={0} onChange={(e) => onChange("br_tope_diario", e.target.value)} placeholder="ej: 1000" type="number" value={vals.br_tope_diario} />
        </Field>
        <Field label="Compra mínima ($)" hint="opcional">
          <input className={inputCls} min={0} onChange={(e) => onChange("br_min_compra", e.target.value)} placeholder="ej: 20000" type="number" value={vals.br_min_compra} />
        </Field>
        <Field label="Cuotas mínimas" hint="opcional">
          <input className={inputCls} min={0} onChange={(e) => onChange("br_cuotas_minimas", e.target.value)} placeholder="ej: 3" type="number" value={vals.br_cuotas_minimas} />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-stone-500">Días válidos</label>
        <div className="flex flex-wrap gap-2">
          {DIAS_OPTIONS.map((dia) => (
            <button
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                vals.br_dias_validos.includes(dia)
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 text-stone-500 hover:border-stone-400"
              }`}
              key={dia}
              onClick={() => toggleDia(dia)}
              type="button"
            >
              {dia}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Clasificacion() {
  const [searchParams] = useSearchParams();
  const rawParam = searchParams.get("raw");
  const [rows, setRows] = useState<RawRow[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>(["needs_review", "failed"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [cardData, setCardData] = useState<Record<string, CardData>>({});
  const [loadingCards, setLoadingCards] = useState<Set<string>>(new Set());
  const [formValues, setFormValues] = useState<Record<string, FormState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveResult, setSaveResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [reprocessResult, setReprocessResult] = useState<Record<string, { loading: boolean; runUrl?: string; error?: string }>>({});
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!rawParam && statusFilters.length === 0) {
      setRows([]); setPageLoading(false); return;
    }
    setPageLoading(true);
    const select = "id, issuer_slug, source_url, raw_payload, scraped_at, processing_status, benefit_id";
    const rowsQuery = rawParam
      ? supabase.from("scraped_benefits_raw").select(select).eq("id", rawParam)
      : supabase.from("scraped_benefits_raw").select(select).in("processing_status", statusFilters).order("scraped_at", { ascending: false });
    Promise.all([supabase.auth.getSession(), rowsQuery]).then(([{ data: sessionData }, { data: rowData, error }]) => {
      setUserEmail(sessionData.session?.user.email ?? null);
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

    const [eventsRes, enrichmentEventsRes, correctionRes, benefitRes] = await Promise.all([
      supabase.from("benefit_processing_events").select("output_payload").eq("raw_benefit_id", row.id).eq("processor", "publication_readiness").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("benefit_processing_events").select("processor, output_payload, created_at").eq("raw_benefit_id", row.id).eq("stage", "enrichment").eq("status", "completed").order("created_at", { ascending: false }).limit(20),
      supabase.from("raw_benefit_corrections").select("corrected_fields, note").eq("raw_benefit_id", row.id).maybeSingle(),
      row.benefit_id
        ? supabase.from("benefits").select("title, description_raw, image_url, channel, ai_description, value_type, value, categories(slug)").eq("id", row.benefit_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const blockers = ((eventsRes.data?.output_payload as Record<string, unknown> | null)?.blockers as string[]) ?? [];
    const b = benefitRes.data as Record<string, unknown> | null;
    const enrichmentOutputs = ((enrichmentEventsRes.data ?? []) as Array<{ output_payload: Record<string, unknown> | null; processor: string }>)
      .reduce<Record<string, unknown>>((acc, event) => ({ ...acc, ...(event.output_payload ?? {}) }), {});
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

    setCardData((prev) => ({ ...prev, [row.id]: { blockers, aiValues, existingCorrection: existing, existingNote } }));

    const rd = deserializeRedemptionDetails(existing?.redemption_details as Record<string, unknown> | null | undefined);
    const br = deserializeBenefitRules(existing?.benefit_rules as Record<string, unknown> | null | undefined);

    const initial: FormState = {
      title: String(existing?.title ?? aiValues.title ?? ""),
      description_raw: String(existing?.description_raw ?? aiValues.description_raw ?? ""),
      image_url: String(existing?.image_url ?? aiValues.image_url ?? ""),
      category_slug: String(existing?.category_slug ?? aiValues.category_slug ?? ""),
      channel: String(existing?.channel ?? aiValues.channel ?? ""),
      ai_description: String(existing?.ai_description ?? aiValues.ai_description ?? ""),
      resolve_needs_review: existing?.needs_review === false,
      value_type: String(existing?.value_type ?? aiValues.value_type ?? ""),
      value: String(existing?.value ?? aiValues.value ?? ""),
      redemption_method: String(existing?.redemption_method ?? ""),
      rd_code: rd.code,
      rd_url: rd.url,
      br_tope_mensual: br.tope_mensual,
      br_tope_diario: br.tope_diario,
      br_dias_validos: br.dias_validos,
      br_min_compra: br.min_compra,
      br_cuotas_minimas: br.cuotas_minimas,
      note: existingNote ?? "",
    };
    setFormValues((prev) => ({ ...prev, [row.id]: initial }));
    setLoadingCards((prev) => { const s = new Set(prev); s.delete(row.id); return s; });
  };

  const handleSelect = (row: RawRow) => {
    setSelectedId(row.id);
    setShowRaw(false);
    if (!cardData[row.id]) loadCardData(row);
  };

  const handleNext = () => {
    if (!selectedId) return;
    const idx = rows.findIndex((r) => r.id === selectedId);
    const next = rows[idx + 1];
    if (next) handleSelect(next);
  };

  const setField = <K extends keyof FormState>(rawId: string, field: K, val: FormState[K]) => {
    setFormValues((prev) => ({ ...prev, [rawId]: { ...prev[rawId], [field]: val } }));
  };

  const handleSave = async (rawId: string) => {
    const vals = formValues[rawId];
    if (!vals) return;

    const cf: Record<string, unknown> = {};
    if (vals.title.trim()) cf.title = vals.title.trim();
    if (vals.description_raw.trim()) cf.description_raw = vals.description_raw.trim();
    if (vals.image_url.trim()) cf.image_url = vals.image_url.trim();
    if (vals.category_slug) cf.category_slug = vals.category_slug;
    if (vals.channel) cf.channel = vals.channel;
    if (vals.ai_description.trim()) cf.ai_description = vals.ai_description.trim();
    if (vals.resolve_needs_review) cf.needs_review = false;
    if (vals.value_type) cf.value_type = vals.value_type;
    if (vals.value.trim()) cf.value = Number(vals.value);
    if (vals.redemption_method) cf.redemption_method = vals.redemption_method;
    const rd = serializeRedemptionDetails(vals.redemption_method, vals.rd_code, vals.rd_url);
    if (rd) cf.redemption_details = rd;
    const br = serializeBenefitRules(vals);
    if (br) cf.benefit_rules = br;

    setSaving((prev) => new Set(prev).add(rawId));
    const { error } = await supabase.from("raw_benefit_corrections").upsert(
      { raw_benefit_id: rawId, corrected_fields: cf, corrected_by: userEmail, note: vals.note.trim() || null },
      { onConflict: "raw_benefit_id" },
    );
    setSaving((prev) => { const s = new Set(prev); s.delete(rawId); return s; });

    if (error) {
      setSaveResult((prev) => ({ ...prev, [rawId]: { ok: false, msg: error.message } }));
      return;
    }

    const FIXABLE: Record<string, boolean> = {
      title_missing: !cf.title,
      description_missing: !cf.description_raw,
      image_url_missing: !cf.image_url,
      category_id_missing: !cf.category_slug,
      channel_missing: !cf.channel,
      ai_description_missing: !cf.ai_description,
      needs_manual_review: cf.needs_review !== false,
    };
    const currentBlockers = cardData[rawId]?.blockers ?? [];
    const fixableInThisCard = currentBlockers.filter((b) => b in FIXABLE);
    const stillUnresolved = fixableInThisCard.filter((b) => FIXABLE[b]);

    if (fixableInThisCard.length > 0 && stillUnresolved.length === 0) {
      setSaveResult((prev) => ({ ...prev, [rawId]: { ok: true, msg: "Corrección guardada. Disparando reproceso…" } }));
      setReprocessResult((prev) => ({ ...prev, [rawId]: { loading: true } }));
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const { data: runData, error: runError } = await supabase.functions.invoke("run-reprocess", {
          body: { rawBenefitId: rawId, force: true },
          headers: { Authorization: `Bearer ${token}` },
        });
        setReprocessResult((prev) => ({
          ...prev,
          [rawId]: { loading: false, runUrl: (runData as Record<string, unknown> | null)?.runUrl as string | undefined, error: runError?.message },
        }));
      } else {
        setReprocessResult((prev) => ({ ...prev, [rawId]: { loading: false, error: "No autenticado." } }));
      }
    } else {
      setSaveResult((prev) => ({ ...prev, [rawId]: { ok: true, msg: "Corrección guardada." } }));
    }
  };

  // ─── Selected row derived state ─────────────────────────────────────────────

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const data = selectedId ? cardData[selectedId] : null;
  const vals = selectedId ? formValues[selectedId] : null;
  const isLoadingCard = selectedId ? loadingCards.has(selectedId) : false;
  const isSaving = selectedId ? saving.has(selectedId) : false;
  const result = selectedId ? saveResult[selectedId] : undefined;

  const blockerFields = new Set(
    (data?.blockers ?? []).map((b) => BLOCKER_FIELD_MAP[b]).filter(Boolean),
  );

  const unresolvedBlockers = selectedId ? (data?.blockers ?? []).filter((b) => {
    const field = BLOCKER_FIELD_MAP[b];
    if (!field || !vals) return true;
    if (field === "title") return !vals.title.trim();
    if (field === "description_raw") return !vals.description_raw.trim();
    if (field === "image_url") return !vals.image_url.trim();
    if (field === "category_slug") return !vals.category_slug;
    if (field === "channel") return !vals.channel;
    if (field === "ai_description") return !vals.ai_description.trim();
    if (field === "resolve_needs_review") return !vals.resolve_needs_review;
    return true;
  }) : [];

  const correctedFields = data?.existingCorrection ?? null;

  const sourceFor = (field: keyof FormState, aiValue?: string, rawValue?: unknown) =>
    vals ? getCurrentValueSource({ aiValue, correctedFields, currentValue: vals[field] as string | boolean, field, rawValue }) : undefined;

  const payload = selectedRow?.raw_payload ?? {};
  const rawTitle = String(payload.title ?? payload.name ?? selectedRow?.source_url ?? selectedRow?.id ?? "");
  const rawDescription = String(payload.description_raw ?? payload.description ?? "");
  const rawImageUrl = String(payload.image_url ?? payload.merchant_image_url ?? "");

  const selectedIdx = rows.findIndex((r) => r.id === selectedId);

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
            {["needs_review", "failed", "pending", "published"].map((status) => (
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
            const rowData = cardData[row.id];
            const isSelected = row.id === selectedId;
            const missingLabels = rowData ? rowData.blockers.map((b) => BLOCKER_LABELS[b] ?? b).join(", ") : row.processing_status ?? "";
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
                  <span className={`text-[12.5px] font-medium leading-snug truncate ${isSelected ? "text-stone-900" : "text-stone-700"}`}>{rowTitle}</span>
                  <span className="text-[10px] text-stone-400 shrink-0">{row.issuer_slug ?? ""}</span>
                </div>
                <div className="text-[11px] text-stone-400 truncate">{missingLabels}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Editor (right) ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {!selectedRow ? (
          <div className="flex-1 flex items-center justify-center text-stone-300 text-sm">
            Seleccioná un beneficio de la cola
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-8 pt-5 pb-4 border-b border-stone-200 shrink-0">
              <div className="text-[11px] text-stone-400 mb-1.5">
                Clasificación → <span className="text-stone-600">{rawTitle}</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-semibold text-stone-900 leading-snug mb-2 truncate">
                    {vals?.title || rawTitle}
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
                <div className="flex gap-2 shrink-0">
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
                  {showRaw && (
                    <pre className="mb-5 max-h-60 overflow-auto rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-500">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  )}

                  {vals && (
                    <div className="flex flex-col gap-0">

                      {/* Section: Contenido */}
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-300">Contenido</span>
                        <div className="flex-1 h-px bg-stone-100" />
                      </div>

                      <FieldPair
                        label="Título"
                        rawValue={rawTitle}
                        source={sourceFor("title", data?.aiValues.title, payload.title)}
                        isBlocker={blockerFields.has("title")}
                      >
                        <input
                          className={blockerFields.has("title") && !vals.title.trim() ? inputReqCls : inputCls}
                          onChange={(e) => setField(selectedRow.id, "title", e.target.value)}
                          placeholder="Título del beneficio"
                          value={vals.title}
                        />
                        {blockerFields.has("title") && !vals.title.trim() && (
                          <p className="text-[10px] text-stone-400">necesario para publicar</p>
                        )}
                      </FieldPair>

                      <FieldPair
                        label="Descripción"
                        rawValue={rawDescription}
                        source={sourceFor("description_raw", data?.aiValues.description_raw, payload.description)}
                        isBlocker={blockerFields.has("description_raw")}
                      >
                        <textarea
                          className={`${blockerFields.has("description_raw") && !vals.description_raw.trim() ? inputReqCls : inputCls} min-h-20 resize-y`}
                          onChange={(e) => setField(selectedRow.id, "description_raw", e.target.value)}
                          placeholder="Descripción completa"
                          value={vals.description_raw}
                        />
                        {blockerFields.has("description_raw") && !vals.description_raw.trim() && (
                          <p className="text-[10px] text-stone-400">necesaria para publicar</p>
                        )}
                      </FieldPair>

                      <FieldPair
                        label="Imagen"
                        rawValue={rawImageUrl}
                        source={sourceFor("image_url", data?.aiValues.image_url, payload.image_url)}
                        isBlocker={blockerFields.has("image_url")}
                      >
                        <input
                          className={blockerFields.has("image_url") && !vals.image_url.trim() ? inputReqCls : inputCls}
                          onChange={(e) => setField(selectedRow.id, "image_url", e.target.value)}
                          placeholder="https://..."
                          value={vals.image_url}
                        />
                        {blockerFields.has("image_url") && !vals.image_url.trim() && (
                          <p className="text-[10px] text-stone-400">necesaria para publicar</p>
                        )}
                        {vals.image_url.trim() && (
                          <img alt="" className="mt-2 h-20 w-32 rounded-md border border-stone-100 object-cover" src={vals.image_url.trim()} />
                        )}
                      </FieldPair>

                      {/* Section: Descripción IA */}
                      <div className="flex items-center gap-3 mb-4 mt-6">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-300">Descripción IA</span>
                        <div className="flex-1 h-px bg-stone-100" />
                      </div>

                      <FieldPair
                        label="Descripción IA"
                        rawValue={String(data?.aiValues.ai_description ?? "")}
                        source={sourceFor("ai_description", data?.aiValues.ai_description)}
                        isBlocker={blockerFields.has("ai_description")}
                        hint="máx. 150 chars"
                      >
                        <textarea
                          className={`${blockerFields.has("ai_description") && !vals.ai_description.trim() ? inputReqCls : inputCls} min-h-16 resize-y`}
                          maxLength={150}
                          onChange={(e) => setField(selectedRow.id, "ai_description", e.target.value)}
                          placeholder="Descripción corta visible para el usuario"
                          value={vals.ai_description}
                        />
                        <p className="text-right text-[10px] text-stone-400">{vals.ai_description.length}/150</p>
                        {blockerFields.has("ai_description") && !vals.ai_description.trim() && (
                          <p className="text-[10px] text-stone-400">necesaria para publicar</p>
                        )}
                      </FieldPair>

                      {/* Section: Clasificación */}
                      <div className="flex items-center gap-3 mb-4 mt-6">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-300">Clasificación</span>
                        <div className="flex-1 h-px bg-stone-100" />
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <Field label="Categoría" isBlocker={blockerFields.has("category_slug")} source={sourceFor("category_slug", data?.aiValues.category_slug, payload.category)}>
                          <select
                            className={blockerFields.has("category_slug") && !vals.category_slug ? inputReqCls : selectCls}
                            onChange={(e) => setField(selectedRow.id, "category_slug", e.target.value)}
                            value={vals.category_slug}
                          >
                            {CATEGORY_SLUG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {blockerFields.has("category_slug") && !vals.category_slug && (
                            <p className="text-[10px] text-stone-400">necesaria para publicar</p>
                          )}
                        </Field>
                        <Field label="Canal" isBlocker={blockerFields.has("channel")} source={sourceFor("channel", data?.aiValues.channel, payload.channel)}>
                          <select
                            className={blockerFields.has("channel") && !vals.channel ? inputReqCls : selectCls}
                            onChange={(e) => setField(selectedRow.id, "channel", e.target.value)}
                            value={vals.channel}
                          >
                            {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {blockerFields.has("channel") && !vals.channel && (
                            <p className="text-[10px] text-stone-400">necesario para publicar</p>
                          )}
                        </Field>
                      </div>

                      {(blockerFields.has("resolve_needs_review") || data?.blockers.includes("needs_manual_review")) && (
                        <div className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 mb-3">
                          <input
                            checked={vals.resolve_needs_review}
                            className="mt-0.5 h-4 w-4 accent-stone-900"
                            id={`resolve-${selectedRow.id}`}
                            onChange={(e) => setField(selectedRow.id, "resolve_needs_review", e.target.checked)}
                            type="checkbox"
                          />
                          <label className="cursor-pointer text-sm text-stone-700" htmlFor={`resolve-${selectedRow.id}`}>
                            <span className="font-medium">Resolver revisión manual</span>
                            <span className="ml-1 text-stone-400">— marcar cuando la ambigüedad esté resuelta</span>
                          </label>
                        </div>
                      )}

                      {/* Section: Opcionales */}
                      <div className="flex items-center gap-3 mb-4 mt-6">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-300">Datos opcionales</span>
                        <div className="flex-1 h-px bg-stone-100" />
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <Field label="Tipo de valor" source={sourceFor("value_type", data?.aiValues.value_type, payload.value_type)}>
                          <select className={selectCls} onChange={(e) => setField(selectedRow.id, "value_type", e.target.value)} value={vals.value_type}>
                            {VALUE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </Field>
                        <Field label="Valor" hint="ej: 15 para 15%" source={sourceFor("value", data?.aiValues.value, payload.value)}>
                          <input className={inputCls} onChange={(e) => setField(selectedRow.id, "value", e.target.value)} placeholder="ej: 15" step="any" type="number" value={vals.value} />
                        </Field>
                        <Field label="Método de canje">
                          <select className={selectCls} onChange={(e) => setField(selectedRow.id, "redemption_method", e.target.value)} value={vals.redemption_method}>
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

                      {/* Section: Nota */}
                      <div className="flex items-center gap-3 mb-4 mt-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-300">Nota interna</span>
                        <div className="flex-1 h-px bg-stone-100" />
                      </div>
                      <textarea
                        className={`${inputCls} min-h-12 resize-y mb-6`}
                        onChange={(e) => setField(selectedRow.id, "note", e.target.value)}
                        placeholder="Comentario para el equipo — no se publica…"
                        value={vals.note}
                      />

                      {/* Feedback messages */}
                      {result && (
                        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600 mb-3">
                          {result.msg}
                        </p>
                      )}
                      {reprocessResult[selectedRow.id] && (
                        <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600 mb-3">
                          {reprocessResult[selectedRow.id].loading ? "Disparando reproceso…" :
                            reprocessResult[selectedRow.id].error ? `Error: ${reprocessResult[selectedRow.id].error}` :
                            reprocessResult[selectedRow.id].runUrl ? (
                              <>Reproceso disparado. <a className="underline hover:text-stone-900" href={reprocessResult[selectedRow.id].runUrl} rel="noreferrer" target="_blank">Ver en GitHub Actions →</a></>
                            ) : "Reproceso disparado."
                          }
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bottom bar */}
            <div className="shrink-0 border-t border-stone-200 bg-white px-8 py-3 flex items-center justify-between">
              <div className="text-[11px] text-stone-400">
                {unresolvedBlockers.length > 0
                  ? `${unresolvedBlockers.length} campo${unresolvedBlockers.length > 1 ? "s" : ""} sin completar — no se publicará aún`
                  : selectedId && data ? "Listo para publicar" : ""}
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
                  disabled={isSaving || !vals}
                  onClick={() => selectedId && handleSave(selectedId)}
                  type="button"
                >
                  {isSaving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
