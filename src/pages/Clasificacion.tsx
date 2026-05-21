import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { inputCls, selectCls } from "../lib/styles";

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
  // structured redemption details
  rd_code: string;
  rd_url: string;
  // structured benefit rules
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

const REQUIRED_PUBLICATION_FIELDS = [
  {
    blocker: "title_missing",
    field: "title",
    label: "Título",
  },
  {
    blocker: "description_missing",
    field: "description_raw",
    label: "Descripción",
  },
  {
    blocker: "image_url_missing",
    field: "image_url",
    label: "Imagen",
  },
  {
    blocker: "category_id_missing",
    field: "category_slug",
    label: "Categoría",
  },
  { blocker: "channel_missing", field: "channel", label: "Canal" },
  {
    blocker: "ai_description_missing",
    field: "ai_description",
    label: "Descripción IA",
  },
  {
    blocker: "needs_manual_review",
    field: "resolve_needs_review",
    label: "Revisión manual resuelta",
  },
  {
    blocker: "semantic_vector_missing",
    field: null,
    label: "Vector semántico",
  },
] as const;

// ─── Styling helpers ──────────────────────────────────────────────────────────

const blockerInputCls =
  "rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-400";
const blockerSelectCls = `${blockerInputCls} bg-amber-50`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeRedemptionDetails(
  method: string,
  code: string,
  url: string,
): Record<string, unknown> | null {
  if (method === "code" || method === "coupon") {
    return code.trim() ? { code: code.trim() } : null;
  }
  if (method === "qr") {
    return url.trim() ? { qr_url: url.trim() } : null;
  }
  if (method === "app_link" || method === "deep_link") {
    return url.trim() ? { url: url.trim() } : null;
  }
  return null;
}

function deserializeRedemptionDetails(
  rd: Record<string, unknown> | null | undefined,
): { code: string; url: string } {
  if (!rd) return { code: "", url: "" };
  return {
    code: String(rd.code ?? ""),
    url: String(rd.url ?? rd.qr_url ?? ""),
  };
}

function serializeBenefitRules(
  vals: FormState,
): Record<string, unknown> | null {
  const rules: Record<string, unknown> = {};
  if (vals.br_tope_mensual.trim())
    rules.tope_mensual = Number(vals.br_tope_mensual);
  if (vals.br_tope_diario.trim())
    rules.tope_diario = Number(vals.br_tope_diario);
  if (vals.br_dias_validos.length) rules.dias_validos = vals.br_dias_validos;
  if (vals.br_min_compra.trim()) rules.min_compra = Number(vals.br_min_compra);
  if (vals.br_cuotas_minimas.trim())
    rules.cuotas_minimas = Number(vals.br_cuotas_minimas);
  return Object.keys(rules).length ? rules : null;
}

function deserializeBenefitRules(
  br: Record<string, unknown> | null | undefined,
) {
  if (!br)
    return {
      tope_mensual: "",
      tope_diario: "",
      dias_validos: [] as string[],
      min_compra: "",
      cuotas_minimas: "",
    };
  return {
    tope_mensual: br.tope_mensual != null ? String(br.tope_mensual) : "",
    tope_diario: br.tope_diario != null ? String(br.tope_diario) : "",
    dias_validos: Array.isArray(br.dias_validos)
      ? (br.dias_validos as string[])
      : [],
    min_compra: br.min_compra != null ? String(br.min_compra) : "",
    cuotas_minimas: br.cuotas_minimas != null ? String(br.cuotas_minimas) : "",
  };
}

function hasOwnValue(
  source: Record<string, unknown> | null | undefined,
  key: string,
) {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

function hasTextValue(value: unknown) {
  return value != null && String(value).trim() !== "";
}

function getCurrentValueSource({
  aiValue,
  correctedFields,
  currentValue,
  field,
  rawValue,
}: {
  aiValue?: string;
  correctedFields?: Record<string, unknown> | null;
  currentValue: string | boolean;
  field: string;
  rawValue?: unknown;
}) {
  const correctionField =
    field === "resolve_needs_review" ? "needs_review" : field;
  if (hasOwnValue(correctedFields, correctionField)) return "Corrección manual";
  if (typeof currentValue === "boolean")
    return currentValue ? "Corrección manual" : "Pendiente";
  if (!currentValue.trim()) return "Pendiente";
  if (aiValue && currentValue === aiValue) return "Pipeline/IA";
  if (hasTextValue(rawValue) && currentValue === String(rawValue))
    return "Raw scrapeado";
  return "Manual sin guardar";
}

function getSourceBadgeClass(source: string) {
  if (source === "Corrección manual") return "bg-teal-50 text-teal-700";
  if (source === "Manual sin guardar") return "bg-amber-50 text-amber-700";
  if (source === "Pendiente") return "bg-red-50 text-red-600";
  return "bg-gray-100 text-gray-600";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  isBlocker,
  required,
  source,
  hint,
  children,
}: {
  label: string;
  isBlocker?: boolean;
  required?: boolean;
  source?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`text-sm font-medium ${isBlocker ? "text-amber-700" : "text-gray-700"}`}
        >
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
          {isBlocker && <span className="ml-1 text-amber-500">●</span>}
        </label>
        {source && (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${getSourceBadgeClass(source)}`}
          >
            Origen: {source}
          </span>
        )}
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function RedemptionDetailsFields({
  method,
  code,
  url,
  onCode,
  onUrl,
}: {
  method: string;
  code: string;
  url: string;
  onCode: (v: string) => void;
  onUrl: (v: string) => void;
}) {
  if (
    !method ||
    method === "bin_detection" ||
    method === "membership_validation" ||
    method === "automatic_checkout" ||
    method === "gift_with_purchase" ||
    method === "manual_receipt_upload"
  ) {
    return null;
  }
  if (method === "code" || method === "coupon") {
    return (
      <Field label="Código de descuento">
        <input
          className={inputCls}
          onChange={(e) => onCode(e.target.value)}
          placeholder="ej: RAUKA15"
          value={code}
        />
      </Field>
    );
  }
  if (method === "qr") {
    return (
      <Field label="URL del QR">
        <input
          className={inputCls}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://..."
          value={url}
        />
      </Field>
    );
  }
  if (method === "app_link" || method === "deep_link") {
    return (
      <Field label="URL de destino">
        <input
          className={inputCls}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://..."
          value={url}
        />
      </Field>
    );
  }
  return null;
}

function BenefitRulesFields({
  vals,
  onChange,
}: {
  vals: FormState;
  onChange: <K extends keyof FormState>(field: K, val: FormState[K]) => void;
}) {
  const toggleDia = (dia: string) => {
    const current = vals.br_dias_validos;
    const next = current.includes(dia)
      ? current.filter((d) => d !== dia)
      : [...current, dia];
    onChange("br_dias_validos", next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Tope mensual ($)" hint="opcional">
          <input
            className={inputCls}
            min={0}
            onChange={(e) => onChange("br_tope_mensual", e.target.value)}
            placeholder="ej: 5000"
            type="number"
            value={vals.br_tope_mensual}
          />
        </Field>
        <Field label="Tope diario ($)" hint="opcional">
          <input
            className={inputCls}
            min={0}
            onChange={(e) => onChange("br_tope_diario", e.target.value)}
            placeholder="ej: 1000"
            type="number"
            value={vals.br_tope_diario}
          />
        </Field>
        <Field label="Compra mínima ($)" hint="opcional">
          <input
            className={inputCls}
            min={0}
            onChange={(e) => onChange("br_min_compra", e.target.value)}
            placeholder="ej: 20000"
            type="number"
            value={vals.br_min_compra}
          />
        </Field>
        <Field label="Cuotas mínimas" hint="opcional">
          <input
            className={inputCls}
            min={0}
            onChange={(e) => onChange("br_cuotas_minimas", e.target.value)}
            placeholder="ej: 3"
            type="number"
            value={vals.br_cuotas_minimas}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Días válidos
        </label>
        <div className="flex flex-wrap gap-2">
          {DIAS_OPTIONS.map((dia) => (
            <button
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                vals.br_dias_validos.includes(dia)
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:border-teal-400"
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
  const [cardData, setCardData] = useState<Record<string, CardData>>({});
  const [loadingCards, setLoadingCards] = useState<Set<string>>(new Set());
  const [formValues, setFormValues] = useState<Record<string, FormState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveResult, setSaveResult] = useState<
    Record<string, { ok: boolean; msg: string }>
  >({});
  const [reprocessResult, setReprocessResult] = useState<
    Record<string, { loading: boolean; runUrl?: string; error?: string }>
  >({});
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Deep-link `?raw=<id>`: carga ese raw puntual sin importar el filtro de estado
    // (lo usa BenefitEdit para corregir un beneficio scraped ya publicado).
    if (!rawParam && statusFilters.length === 0) {
      setRows([]);
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    const select =
      "id, issuer_slug, source_url, raw_payload, scraped_at, processing_status, benefit_id";
    const rowsQuery = rawParam
      ? supabase.from("scraped_benefits_raw").select(select).eq("id", rawParam)
      : supabase
          .from("scraped_benefits_raw")
          .select(select)
          .in("processing_status", statusFilters)
          .order("scraped_at", { ascending: false });
    Promise.all([supabase.auth.getSession(), rowsQuery]).then(
      ([{ data: sessionData }, { data: rowData, error }]) => {
        setUserEmail(sessionData.session?.user.email ?? null);
        if (error) setPageError(error.message);
        else setRows((rowData ?? []) as RawRow[]);
        setPageLoading(false);
      },
    );
  }, [statusFilters, rawParam]);

  const loadCardData = async (row: RawRow) => {
    setLoadingCards((prev) => new Set(prev).add(row.id));

    const [eventsRes, enrichmentEventsRes, correctionRes, benefitRes] = await Promise.all([
      supabase
        .from("benefit_processing_events")
        .select("output_payload")
        .eq("raw_benefit_id", row.id)
        .eq("processor", "publication_readiness")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("benefit_processing_events")
        .select("processor, output_payload, created_at")
        .eq("raw_benefit_id", row.id)
        .eq("stage", "enrichment")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("raw_benefit_corrections")
        .select("corrected_fields, note")
        .eq("raw_benefit_id", row.id)
        .maybeSingle(),

      row.benefit_id
        ? supabase
            .from("benefits")
            .select(
              "title, description_raw, image_url, channel, ai_description, value_type, value, categories(slug)",
            )
            .eq("id", row.benefit_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const blockers =
      ((eventsRes.data?.output_payload as Record<string, unknown> | null)
        ?.blockers as string[]) ?? [];

    const b = benefitRes.data as Record<string, unknown> | null;
    const enrichmentOutputs = ((enrichmentEventsRes.data ?? []) as Array<{
      output_payload: Record<string, unknown> | null;
      processor: string;
    }>).reduce<Record<string, unknown>>((acc, event) => ({
      ...acc,
      ...(event.output_payload ?? {}),
    }), {});
    const payload = row.raw_payload ?? {};
    const nestedPayload = (payload.raw_payload && typeof payload.raw_payload === "object")
      ? (payload.raw_payload as Record<string, unknown>)
      : {};
    const aiValues: AiValues = {
      title: (b?.title as string | null) ?? (payload.title as string | undefined),
      description_raw: (b?.description_raw as string | null) ??
        (payload.description as string | undefined) ??
        (nestedPayload.description as string | undefined),
      image_url: (b?.image_url as string | null) ?? (payload.image_url as string | undefined),
      category_slug:
        (b?.categories as { slug?: string } | null)?.slug ??
        (enrichmentOutputs.category_slug as string | undefined),
      channel: (b?.channel as string | null) ?? (enrichmentOutputs.channel as string | undefined),
      ai_description: (b?.ai_description as string | null) ?? (enrichmentOutputs.ai_description as string | undefined),
      value_type: (b?.value_type as string | null) ?? (enrichmentOutputs.value_type as string | undefined),
      value: b?.value != null ? String(b.value) : enrichmentOutputs.value != null ? String(enrichmentOutputs.value) : undefined,
    };

    const existing =
      (correctionRes.data?.corrected_fields as Record<
        string,
        unknown
      > | null) ?? null;
    const existingNote = (correctionRes.data?.note as string | null) ?? null;

    setCardData((prev) => ({
      ...prev,
      [row.id]: {
        blockers,
        aiValues,
        existingCorrection: existing,
        existingNote,
      },
    }));

    const rd = deserializeRedemptionDetails(
      existing?.redemption_details as
        | Record<string, unknown>
        | null
        | undefined,
    );
    const br = deserializeBenefitRules(
      existing?.benefit_rules as Record<string, unknown> | null | undefined,
    );

    const initial: FormState = {
      title: String(existing?.title ?? aiValues.title ?? ""),
      description_raw: String(existing?.description_raw ?? aiValues.description_raw ?? ""),
      image_url: String(existing?.image_url ?? aiValues.image_url ?? ""),
      category_slug: String(
        existing?.category_slug ?? aiValues.category_slug ?? "",
      ),
      channel: String(existing?.channel ?? aiValues.channel ?? ""),
      ai_description: String(
        existing?.ai_description ?? aiValues.ai_description ?? "",
      ),
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
    setLoadingCards((prev) => {
      const s = new Set(prev);
      s.delete(row.id);
      return s;
    });
  };

  const toggleExpand = (row: RawRow) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.add(row.id);
        if (!cardData[row.id]) loadCardData(row);
      }
      return next;
    });
  };

  const toggleRaw = (id: string) => {
    setShowRaw((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const setField = <K extends keyof FormState>(
    rawId: string,
    field: K,
    val: FormState[K],
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [rawId]: { ...prev[rawId], [field]: val },
    }));
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
    if (vals.ai_description.trim())
      cf.ai_description = vals.ai_description.trim();
    if (vals.resolve_needs_review) cf.needs_review = false;
    if (vals.value_type) cf.value_type = vals.value_type;
    if (vals.value.trim()) cf.value = Number(vals.value);
    if (vals.redemption_method) cf.redemption_method = vals.redemption_method;

    const rd = serializeRedemptionDetails(
      vals.redemption_method,
      vals.rd_code,
      vals.rd_url,
    );
    if (rd) cf.redemption_details = rd;

    const br = serializeBenefitRules(vals);
    if (br) cf.benefit_rules = br;

    setSaving((prev) => new Set(prev).add(rawId));
    const { error } = await supabase.from("raw_benefit_corrections").upsert(
      {
        raw_benefit_id: rawId,
        corrected_fields: cf,
        corrected_by: userEmail,
        note: vals.note.trim() || null,
      },
      { onConflict: "raw_benefit_id" },
    );
    setSaving((prev) => {
      const s = new Set(prev);
      s.delete(rawId);
      return s;
    });

    if (error) {
      setSaveResult((prev) => ({
        ...prev,
        [rawId]: { ok: false, msg: error.message },
      }));
      return;
    }

    // Check if all fixable blockers are now covered by this correction
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
      // All fixable blockers covered — auto-trigger reprocess
      setSaveResult((prev) => ({
        ...prev,
        [rawId]: {
          ok: true,
          msg: "Corrección guardada. Disparando reproceso automático…",
        },
      }));
      setReprocessResult((prev) => ({ ...prev, [rawId]: { loading: true } }));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const { data: runData, error: runError } =
          await supabase.functions.invoke("run-reprocess", {
            body: { rawBenefitId: rawId, force: true },
            headers: { Authorization: `Bearer ${token}` },
          });
        setReprocessResult((prev) => ({
          ...prev,
          [rawId]: {
            loading: false,
            runUrl: (runData as Record<string, unknown> | null)?.runUrl as
              | string
              | undefined,
            error: runError?.message,
          },
        }));
      } else {
        setReprocessResult((prev) => ({
          ...prev,
          [rawId]: { loading: false, error: "No autenticado." },
        }));
      }
    } else {
      setSaveResult((prev) => ({
        ...prev,
        [rawId]: {
          ok: true,
          msg: "Corrección guardada. Cuando cubras todos los campos requeridos, el reproceso se disparará automáticamente.",
        },
      }));
    }
  };

  if (pageLoading) return <p className="text-gray-400">Cargando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          Clasificación
          {rows.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-700">
              {rows.length}
            </span>
          )}
        </h1>
      </div>

      {/* Flow explanation */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <p>
          <strong>Cómo funciona:</strong> esta pantalla guarda correcciones
          manuales sobre el raw scrapeado. Si al guardar quedan cubiertos todos
          los bloqueadores corregibles, se dispara el reproceso automático para
          que el pipeline intente publicarlo. Los campos con{" "}
          <span className="font-bold text-red-600">*</span> son obligatorios
          para publicar; los campos con{" "}
          <span className="font-bold text-amber-600">●</span> están bloqueando
          este raw ahora.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {["needs_review", "failed", "pending", "published"].map((status) => (
          <button
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              statusFilters.includes(status)
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-gray-200 bg-white text-gray-600"
            }`}
            key={status}
            onClick={() =>
              setStatusFilters((prev) =>
                prev.includes(status)
                  ? prev.filter((item) => item !== status)
                  : [...prev, status],
              )
            }
            type="button"
          >
            {status}
          </button>
        ))}
      </div>

      {pageError ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {pageError}
        </div>
      ) : null}

      {!pageError && rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-gray-400">
          Sin beneficios por clasificar
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const payload = row.raw_payload ?? {};
          const title = String(
            payload.title ?? payload.name ?? row.source_url ?? row.id,
          );
          const imageUrl = String(payload.image_url ?? payload.merchant_image_url ?? "");
          const description = String(
            payload.description_raw ?? payload.description ?? "",
          );
          const isExpanded = expanded.has(row.id);
          const isRawVisible = showRaw.has(row.id);
          const data = cardData[row.id];
          const isLoadingCard = loadingCards.has(row.id);
          const vals = formValues[row.id];
          const isSaving = saving.has(row.id);
          const result = saveResult[row.id];
          const correctedFields = data?.existingCorrection ?? null;

          const blockerFields = new Set(
            (data?.blockers ?? [])
              .map((b) => BLOCKER_FIELD_MAP[b])
              .filter(Boolean),
          );

          const unresolvedBlockers = (data?.blockers ?? []).filter((b) => {
            const field = BLOCKER_FIELD_MAP[b];
            if (!field || !vals) return true;
            if (field === "title") return !vals.title.trim();
            if (field === "description_raw") return !vals.description_raw.trim();
            if (field === "image_url") return !vals.image_url.trim();
            if (field === "category_slug") return !vals.category_slug;
            if (field === "channel") return !vals.channel;
            if (field === "ai_description") return !vals.ai_description.trim();
            if (field === "resolve_needs_review")
              return !vals.resolve_needs_review;
            return true;
          });

          const requiredStatus = REQUIRED_PUBLICATION_FIELDS.map((item) => {
            const isBlocking = data?.blockers.includes(item.blocker) ?? false;
            const field = item.field;
            const resolved = !isBlocking
              ? true
              : field && vals
                ? field === "category_slug"
                  ? !!vals.category_slug
                  : field === "title"
                    ? !!vals.title.trim()
                    : field === "description_raw"
                      ? !!vals.description_raw.trim()
                      : field === "image_url"
                        ? !!vals.image_url.trim()
                        : field === "channel"
                    ? !!vals.channel
                    : field === "ai_description"
                      ? !!vals.ai_description.trim()
                      : field === "resolve_needs_review"
                        ? vals.resolve_needs_review
                        : false
                : false;
            return { ...item, isBlocking, resolved };
          });

          const sourceFor = (
            field: keyof FormState,
            aiValue?: string,
            rawValue?: unknown,
          ) =>
            vals
              ? getCurrentValueSource({
                  aiValue,
                  correctedFields,
                  currentValue: vals[field] as string | boolean,
                  field,
                  rawValue,
                })
              : undefined;

          return (
            <div
              className="rounded-xl border border-amber-200 bg-white"
              key={row.id}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-start gap-3">
                    {imageUrl ? (
                      <img alt="" className="h-14 w-20 rounded-md border border-gray-100 object-cover" src={imageUrl} />
                    ) : null}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{title}</p>
                      {row.processing_status && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {row.processing_status}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                    {row.issuer_slug && (
                      <span className="font-medium text-gray-600">
                        {row.issuer_slug}
                      </span>
                    )}
                    {row.scraped_at && (
                      <span>{row.scraped_at.substring(0, 10)}</span>
                    )}
                    {row.source_url && (
                      <a
                        className="max-w-xs truncate text-teal-600 hover:underline"
                        href={row.source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {row.source_url}
                      </a>
                    )}
                  </div>
                  {/* Blocker pills */}
                  {data && data.blockers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {data.blockers.map((b) => {
                        const field = BLOCKER_FIELD_MAP[b];
                        const resolved =
                          field && vals
                            ? (field === "title" && !!vals.title.trim()) ||
                              (field === "description_raw" &&
                                !!vals.description_raw.trim()) ||
                              (field === "image_url" &&
                                !!vals.image_url.trim()) ||
                              (field === "category_slug" &&
                                !!vals.category_slug) ||
                              (field === "channel" && !!vals.channel) ||
                              (field === "ai_description" &&
                                !!vals.ai_description.trim()) ||
                              (field === "resolve_needs_review" &&
                                vals.resolve_needs_review)
                            : false;
                        return (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              resolved
                                ? "bg-emerald-100 text-emerald-700 line-through"
                                : "bg-amber-100 text-amber-700"
                            }`}
                            key={b}
                          >
                            {BLOCKER_LABELS[b] ?? b}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                  onClick={() => toggleExpand(row)}
                  type="button"
                >
                  {isExpanded ? "Ocultar" : "Clasificar"}
                </button>
              </div>

              {/* Expanded section */}
              {isExpanded && (
                <div className="border-t border-amber-100">
                  {isLoadingCard ? (
                    <p className="px-4 py-4 text-sm text-gray-400">
                      Cargando datos...
                    </p>
                  ) : (
                    <div className="flex flex-col gap-6 px-4 py-4">
                      {/* Original data */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Datos originales
                          </p>
                          <button
                            className="text-xs text-gray-400 hover:text-gray-600"
                            onClick={() => toggleRaw(row.id)}
                            type="button"
                          >
                            {isRawVisible
                              ? "Ocultar JSON"
                              : "Ver JSON completo"}
                          </button>
                        </div>

                        <div className="rounded-lg bg-gray-50 p-3 text-sm">
                          {description && (
                            <div className="mb-3">
                              <p className="mb-1 text-xs font-medium text-gray-500">
                                Descripción
                              </p>
                              <p className="whitespace-pre-wrap text-gray-700">
                                {description}
                              </p>
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
                            {(
                              [
                                "merchant_name",
                                "merchant_image_url",
                                "image_url",
                                "category",
                                "channel",
                                "value_type",
                                "value",
                                "merchant_addresses",
                              ] as const
                            )
                              .filter(
                                (k) =>
                                  payload[k] != null &&
                                  String(payload[k]).trim() !== "",
                              )
                              .map((k) => (
                                <div className="flex gap-1.5" key={k}>
                                  <span className="shrink-0 font-medium text-gray-500">
                                    {k}:
                                  </span>
                                  <span className="text-gray-700">
                                    {String(payload[k])}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {isRawVisible && (
                          <pre className="max-h-64 overflow-auto rounded-lg bg-gray-100 p-3 text-xs text-gray-600">
                            {JSON.stringify(payload, null, 2)}
                          </pre>
                        )}
                      </div>

                      {/* Correction form */}
                      {vals && (
                        <div className="flex flex-col gap-6">
                          {/* Blockers callout */}
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Estado para publicar
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {requiredStatus.map((item) => (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    item.resolved
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                  key={item.blocker}
                                >
                                  {item.resolved ? "OK" : "Falta"} ·{" "}
                                  {item.label}
                                </span>
                              ))}
                            </div>
                          </div>

                          {unresolvedBlockers.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                              <strong>
                                Faltan {unresolvedBlockers.length} campo
                                {unresolvedBlockers.length > 1 ? "s" : ""} para
                                publicar:
                              </strong>{" "}
                              {unresolvedBlockers
                                .map((b) => BLOCKER_LABELS[b] ?? b)
                                .join(", ")}
                              .
                            </div>
                          )}

                          {/* Required fields */}
                          <div className="flex flex-col gap-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Requeridos para publicar
                            </p>

                            <Field
                              isBlocker={blockerFields.has("title")}
                              label="Título"
                              required
                              source={sourceFor("title", data?.aiValues.title, payload.title)}
                            >
                              <input
                                className={blockerFields.has("title") ? blockerInputCls : inputCls}
                                onChange={(e) => setField(row.id, "title", e.target.value)}
                                placeholder="Título del beneficio"
                                value={vals.title}
                              />
                            </Field>

                            <Field
                              isBlocker={blockerFields.has("description_raw")}
                              label="Descripción"
                              required
                              source={sourceFor("description_raw", data?.aiValues.description_raw, payload.description)}
                            >
                              <textarea
                                className={`${blockerFields.has("description_raw") ? blockerInputCls : inputCls} min-h-20 resize-y`}
                                onChange={(e) => setField(row.id, "description_raw", e.target.value)}
                                placeholder="Descripción completa del beneficio"
                                value={vals.description_raw}
                              />
                            </Field>

                            <Field
                              isBlocker={blockerFields.has("image_url")}
                              label="Imagen"
                              required
                              source={sourceFor("image_url", data?.aiValues.image_url, payload.image_url)}
                            >
                              <input
                                className={blockerFields.has("image_url") ? blockerInputCls : inputCls}
                                onChange={(e) => setField(row.id, "image_url", e.target.value)}
                                placeholder="https://..."
                                value={vals.image_url}
                              />
                              {vals.image_url.trim() ? (
                                <img alt="" className="mt-2 h-20 w-32 rounded-md border border-gray-100 object-cover" src={vals.image_url.trim()} />
                              ) : null}
                            </Field>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <Field
                                isBlocker={blockerFields.has("category_slug")}
                                label="Categoría"
                                required
                                source={sourceFor(
                                  "category_slug",
                                  data?.aiValues.category_slug,
                                  payload.category,
                                )}
                              >
                                <select
                                  className={
                                    blockerFields.has("category_slug")
                                      ? blockerSelectCls
                                      : selectCls
                                  }
                                  onChange={(e) =>
                                    setField(
                                      row.id,
                                      "category_slug",
                                      e.target.value,
                                    )
                                  }
                                  value={vals.category_slug}
                                >
                                  {CATEGORY_SLUG_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field
                                isBlocker={blockerFields.has("channel")}
                                label="Canal"
                                required
                                source={sourceFor(
                                  "channel",
                                  data?.aiValues.channel,
                                  payload.channel,
                                )}
                              >
                                <select
                                  className={
                                    blockerFields.has("channel")
                                      ? blockerSelectCls
                                      : selectCls
                                  }
                                  onChange={(e) =>
                                    setField(row.id, "channel", e.target.value)
                                  }
                                  value={vals.channel}
                                >
                                  {CHANNEL_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            </div>

                            <Field
                              isBlocker={blockerFields.has("ai_description")}
                              label="Descripción IA"
                              hint="máx. 150 caracteres"
                              required
                              source={sourceFor(
                                "ai_description",
                                data?.aiValues.ai_description,
                              )}
                            >
                              <textarea
                                className={`${blockerFields.has("ai_description") ? blockerInputCls : inputCls} min-h-16 resize-y`}
                                maxLength={150}
                                onChange={(e) =>
                                  setField(
                                    row.id,
                                    "ai_description",
                                    e.target.value,
                                  )
                                }
                                placeholder="Descripción corta visible para el usuario"
                                value={vals.ai_description}
                              />
                              <p className="text-right text-xs text-gray-400">
                                {vals.ai_description.length}/150
                              </p>
                            </Field>

                            {(blockerFields.has("resolve_needs_review") ||
                              data?.blockers.includes(
                                "needs_manual_review",
                              )) && (
                              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <input
                                  checked={vals.resolve_needs_review}
                                  className="mt-0.5 h-4 w-4 accent-teal-600"
                                  id={`resolve-${row.id}`}
                                  onChange={(e) =>
                                    setField(
                                      row.id,
                                      "resolve_needs_review",
                                      e.target.checked,
                                    )
                                  }
                                  type="checkbox"
                                />
                                <label
                                  className="cursor-pointer text-sm text-gray-700"
                                  htmlFor={`resolve-${row.id}`}
                                >
                                  <span className="font-medium">
                                    Resolver revisión manual * ●
                                  </span>
                                  <span className="ml-1 text-gray-500">
                                    — marcar cuando la ambigüedad de reglas o
                                    datos esté resuelta
                                  </span>
                                  <span
                                    className={`ml-2 rounded px-1.5 py-0.5 text-xs ${getSourceBadgeClass(sourceFor("resolve_needs_review") ?? "Pendiente")}`}
                                  >
                                    Origen:{" "}
                                    {sourceFor("resolve_needs_review") ??
                                      "Pendiente"}
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>

                          {/* Optional fields */}
                          <div className="flex flex-col gap-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Datos opcionales
                            </p>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <Field
                                label="Tipo de valor"
                                source={sourceFor(
                                  "value_type",
                                  data?.aiValues.value_type,
                                  payload.value_type,
                                )}
                              >
                                <select
                                  className={selectCls}
                                  onChange={(e) =>
                                    setField(
                                      row.id,
                                      "value_type",
                                      e.target.value,
                                    )
                                  }
                                  value={vals.value_type}
                                >
                                  {VALUE_TYPE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field
                                label="Valor"
                                hint="ej: 15 para 15%"
                                source={sourceFor(
                                  "value",
                                  data?.aiValues.value,
                                  payload.value,
                                )}
                              >
                                <input
                                  className={inputCls}
                                  onChange={(e) =>
                                    setField(row.id, "value", e.target.value)
                                  }
                                  placeholder="ej: 15"
                                  step="any"
                                  type="number"
                                  value={vals.value}
                                />
                              </Field>

                              <Field label="Método de canje">
                                <select
                                  className={selectCls}
                                  onChange={(e) =>
                                    setField(
                                      row.id,
                                      "redemption_method",
                                      e.target.value,
                                    )
                                  }
                                  value={vals.redemption_method}
                                >
                                  {REDEMPTION_METHOD_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <RedemptionDetailsFields
                                code={vals.rd_code}
                                method={vals.redemption_method}
                                onCode={(v) => setField(row.id, "rd_code", v)}
                                onUrl={(v) => setField(row.id, "rd_url", v)}
                                url={vals.rd_url}
                              />
                            </div>

                            <div className="rounded-lg border border-gray-200 p-4">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Reglas del beneficio
                              </p>
                              <BenefitRulesFields
                                onChange={(field, val) =>
                                  setField(row.id, field, val)
                                }
                                vals={vals}
                              />
                            </div>

                            <Field label="Nota interna" hint="opcional">
                              <textarea
                                className={`${inputCls} min-h-12 resize-y`}
                                onChange={(e) =>
                                  setField(row.id, "note", e.target.value)
                                }
                                placeholder="Explicación de la corrección o contexto extra…"
                                value={vals.note}
                              />
                            </Field>
                          </div>

                          {result ? (
                            <p
                              className={`rounded-lg px-3 py-2 text-sm ${
                                result.ok
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-red-50 text-red-600"
                              }`}
                            >
                              {result.msg}
                            </p>
                          ) : null}

                          {reprocessResult[row.id] && (
                            <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                              {reprocessResult[row.id].loading ? (
                                "Disparando reproceso…"
                              ) : reprocessResult[row.id].error ? (
                                <span className="text-red-600">
                                  Error al disparar reproceso:{" "}
                                  {reprocessResult[row.id].error}
                                </span>
                              ) : reprocessResult[row.id].runUrl ? (
                                <>
                                  Reproceso disparado.{" "}
                                  <a
                                    className="font-medium underline"
                                    href={reprocessResult[row.id].runUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Ver en GitHub Actions →
                                  </a>
                                </>
                              ) : (
                                "Reproceso disparado."
                              )}
                            </div>
                          )}

                          <div className="border-t border-gray-100 pt-2">
                            <button
                              className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                              disabled={isSaving}
                              onClick={() => handleSave(row.id)}
                              type="button"
                            >
                              {isSaving ? "Guardando..." : "Guardar corrección"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
