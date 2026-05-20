import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = {
  id: string;
  issuer_slug: string | null;
  source_url: string | null;
  raw_payload: Record<string, unknown> | null;
  scraped_at: string | null;
  benefit_id: string | null;
};

type AiValues = {
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

const DIAS_OPTIONS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const BLOCKER_FIELD_MAP: Record<string, keyof FormState> = {
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
};

// ─── Styling helpers ──────────────────────────────────────────────────────────

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500";
const selectCls = `${inputCls} bg-white`;
const blockerInputCls =
  "rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-400";
const blockerSelectCls = `${blockerInputCls} bg-amber-50`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeRedemptionDetails(method: string, code: string, url: string): Record<string, unknown> | null {
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

function deserializeRedemptionDetails(rd: Record<string, unknown> | null | undefined): { code: string; url: string } {
  if (!rd) return { code: "", url: "" };
  return {
    code: String(rd.code ?? ""),
    url: String(rd.url ?? rd.qr_url ?? ""),
  };
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  isBlocker,
  aiHint,
  hint,
  children,
}: {
  label: string;
  isBlocker?: boolean;
  aiHint?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`text-sm font-medium ${isBlocker ? "text-amber-700" : "text-gray-700"}`}>
          {label}
          {isBlocker && <span className="ml-1 text-amber-500">●</span>}
        </label>
        {aiHint && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600">
            IA sugiere: {aiHint}
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
  if (!method || method === "bin_detection" || method === "membership_validation" || method === "automatic_checkout" || method === "gift_with_purchase" || method === "manual_receipt_upload") {
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
    const next = current.includes(dia) ? current.filter((d) => d !== dia) : [...current, dia];
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
        <label className="text-sm font-medium text-gray-700">Días válidos</label>
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
  const [rows, setRows] = useState<RawRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
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
    Promise.all([
      supabase.auth.getSession(),
      supabase
        .from("scraped_benefits_raw")
        .select("id, issuer_slug, source_url, raw_payload, scraped_at, benefit_id")
        .eq("processing_status", "needs_review")
        .order("scraped_at", { ascending: false }),
    ]).then(([{ data: sessionData }, { data: rowData, error }]) => {
      setUserEmail(sessionData.session?.user.email ?? null);
      if (error) setPageError(error.message);
      else setRows((rowData ?? []) as RawRow[]);
      setPageLoading(false);
    });
  }, []);

  const loadCardData = async (row: RawRow) => {
    setLoadingCards((prev) => new Set(prev).add(row.id));

    const [eventsRes, correctionRes, benefitRes] = await Promise.all([
      supabase
        .from("benefit_processing_events")
        .select("output_payload")
        .eq("raw_benefit_id", row.id)
        .eq("processor", "publication_readiness")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("raw_benefit_corrections")
        .select("corrected_fields, note")
        .eq("raw_benefit_id", row.id)
        .maybeSingle(),

      row.benefit_id
        ? supabase
            .from("benefits")
            .select("channel, ai_description, value_type, value, categories(slug)")
            .eq("id", row.benefit_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const blockers =
      ((eventsRes.data?.output_payload as Record<string, unknown> | null)
        ?.blockers as string[]) ?? [];

    const b = benefitRes.data as Record<string, unknown> | null;
    const aiValues: AiValues = {
      category_slug: (b?.categories as { slug?: string } | null)?.slug ?? undefined,
      channel: (b?.channel as string | null) ?? undefined,
      ai_description: (b?.ai_description as string | null) ?? undefined,
      value_type: (b?.value_type as string | null) ?? undefined,
      value: b?.value != null ? String(b.value) : undefined,
    };

    const existing =
      (correctionRes.data?.corrected_fields as Record<string, unknown> | null) ?? null;
    const existingNote = (correctionRes.data?.note as string | null) ?? null;

    setCardData((prev) => ({
      ...prev,
      [row.id]: { blockers, aiValues, existingCorrection: existing, existingNote },
    }));

    const rd = deserializeRedemptionDetails(existing?.redemption_details as Record<string, unknown> | null | undefined);
    const br = deserializeBenefitRules(existing?.benefit_rules as Record<string, unknown> | null | undefined);

    const initial: FormState = {
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

  const setField = <K extends keyof FormState>(rawId: string, field: K, val: FormState[K]) => {
    setFormValues((prev) => ({
      ...prev,
      [rawId]: { ...prev[rawId], [field]: val },
    }));
  };

  const handleSave = async (rawId: string) => {
    const vals = formValues[rawId];
    if (!vals) return;

    const cf: Record<string, unknown> = {};
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
      setSaveResult((prev) => ({ ...prev, [rawId]: { ok: false, msg: error.message } }));
      return;
    }

    // Check if all fixable blockers are now covered by this correction
    const FIXABLE: Record<string, boolean> = {
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
      setSaveResult((prev) => ({ ...prev, [rawId]: { ok: true, msg: "Corrección guardada. Disparando reproceso automático…" } }));
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
          [rawId]: {
            loading: false,
            runUrl: (runData as Record<string, unknown> | null)?.runUrl as string | undefined,
            error: runError?.message,
          },
        }));
      } else {
        setReprocessResult((prev) => ({ ...prev, [rawId]: { loading: false, error: "No autenticado." } }));
      }
    } else {
      setSaveResult((prev) => ({
        ...prev,
        [rawId]: { ok: true, msg: "Corrección guardada. Cuando cubras todos los campos requeridos, el reproceso se disparará automáticamente." },
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
          <strong>Cómo funciona:</strong> Guardar una corrección la almacena en la base de datos. Para que el beneficio se publique, ve a{" "}
          <strong>Pipeline → Reprocesar</strong> después de guardar. Los campos con{" "}
          <span className="font-bold text-amber-600">●</span> son bloqueadores — el beneficio no se publica si faltan.
        </p>
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
          const title = String(payload.title ?? payload.name ?? row.source_url ?? row.id);
          const description = String(payload.description_raw ?? payload.description ?? "");
          const isExpanded = expanded.has(row.id);
          const isRawVisible = showRaw.has(row.id);
          const data = cardData[row.id];
          const isLoadingCard = loadingCards.has(row.id);
          const vals = formValues[row.id];
          const isSaving = saving.has(row.id);
          const result = saveResult[row.id];

          const blockerFields = new Set(
            (data?.blockers ?? []).map((b) => BLOCKER_FIELD_MAP[b]).filter(Boolean),
          );

          const unresolvedBlockers = (data?.blockers ?? []).filter((b) => {
            const field = BLOCKER_FIELD_MAP[b];
            if (!field || !vals) return true;
            if (field === "category_slug") return !vals.category_slug;
            if (field === "channel") return !vals.channel;
            if (field === "ai_description") return !vals.ai_description.trim();
            if (field === "resolve_needs_review") return !vals.resolve_needs_review;
            return true;
          });

          return (
            <div className="rounded-xl border border-amber-200 bg-white" key={row.id}>
              {/* Card header */}
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium text-gray-900">{title}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                    {row.issuer_slug && (
                      <span className="font-medium text-gray-600">{row.issuer_slug}</span>
                    )}
                    {row.scraped_at && <span>{row.scraped_at.substring(0, 10)}</span>}
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
                        const resolved = field && vals
                          ? (field === "category_slug" && !!vals.category_slug) ||
                            (field === "channel" && !!vals.channel) ||
                            (field === "ai_description" && !!vals.ai_description.trim()) ||
                            (field === "resolve_needs_review" && vals.resolve_needs_review)
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
                    <p className="px-4 py-4 text-sm text-gray-400">Cargando datos...</p>
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
                            {isRawVisible ? "Ocultar JSON" : "Ver JSON completo"}
                          </button>
                        </div>

                        <div className="rounded-lg bg-gray-50 p-3 text-sm">
                          {description && (
                            <div className="mb-3">
                              <p className="mb-1 text-xs font-medium text-gray-500">Descripción</p>
                              <p className="whitespace-pre-wrap text-gray-700">{description}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
                            {(["merchant_name", "category", "channel", "value_type", "value"] as const)
                              .filter((k) => payload[k] != null && String(payload[k]).trim() !== "")
                              .map((k) => (
                                <div className="flex gap-1.5" key={k}>
                                  <span className="shrink-0 font-medium text-gray-500">{k}:</span>
                                  <span className="text-gray-700">{String(payload[k])}</span>
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
                          {unresolvedBlockers.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                              <strong>Faltan {unresolvedBlockers.length} campo{unresolvedBlockers.length > 1 ? "s" : ""} para publicar:</strong>{" "}
                              {unresolvedBlockers.map((b) => BLOCKER_LABELS[b] ?? b).join(", ")}.
                            </div>
                          )}

                          {/* Required fields */}
                          <div className="flex flex-col gap-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Requeridos para publicar
                            </p>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <Field
                                aiHint={data?.aiValues.category_slug}
                                isBlocker={blockerFields.has("category_slug")}
                                label="Categoría"
                              >
                                <select
                                  className={blockerFields.has("category_slug") ? blockerSelectCls : selectCls}
                                  onChange={(e) => setField(row.id, "category_slug", e.target.value)}
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
                                aiHint={data?.aiValues.channel}
                                isBlocker={blockerFields.has("channel")}
                                label="Canal"
                              >
                                <select
                                  className={blockerFields.has("channel") ? blockerSelectCls : selectCls}
                                  onChange={(e) => setField(row.id, "channel", e.target.value)}
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
                              aiHint={
                                data?.aiValues.ai_description
                                  ? `"${data.aiValues.ai_description.substring(0, 80)}${data.aiValues.ai_description.length > 80 ? "…" : ""}"`
                                  : undefined
                              }
                              isBlocker={blockerFields.has("ai_description")}
                              label="Descripción IA"
                              hint="máx. 150 caracteres"
                            >
                              <textarea
                                className={`${blockerFields.has("ai_description") ? blockerInputCls : inputCls} min-h-16 resize-y`}
                                maxLength={150}
                                onChange={(e) => setField(row.id, "ai_description", e.target.value)}
                                placeholder="Descripción corta visible para el usuario"
                                value={vals.ai_description}
                              />
                              <p className="text-right text-xs text-gray-400">
                                {vals.ai_description.length}/150
                              </p>
                            </Field>

                            {(blockerFields.has("resolve_needs_review") || data?.blockers.includes("needs_manual_review")) && (
                              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <input
                                  checked={vals.resolve_needs_review}
                                  className="mt-0.5 h-4 w-4 accent-teal-600"
                                  id={`resolve-${row.id}`}
                                  onChange={(e) => setField(row.id, "resolve_needs_review", e.target.checked)}
                                  type="checkbox"
                                />
                                <label className="cursor-pointer text-sm text-gray-700" htmlFor={`resolve-${row.id}`}>
                                  <span className="font-medium">Resolver revisión manual ●</span>
                                  <span className="ml-1 text-gray-500">
                                    — marcar cuando la ambigüedad de reglas o datos esté resuelta
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
                              <Field aiHint={data?.aiValues.value_type} label="Tipo de valor">
                                <select
                                  className={selectCls}
                                  onChange={(e) => setField(row.id, "value_type", e.target.value)}
                                  value={vals.value_type}
                                >
                                  {VALUE_TYPE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field aiHint={data?.aiValues.value} label="Valor" hint="ej: 15 para 15%">
                                <input
                                  className={inputCls}
                                  onChange={(e) => setField(row.id, "value", e.target.value)}
                                  placeholder="ej: 15"
                                  step="any"
                                  type="number"
                                  value={vals.value}
                                />
                              </Field>

                              <Field label="Método de canje">
                                <select
                                  className={selectCls}
                                  onChange={(e) => setField(row.id, "redemption_method", e.target.value)}
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
                                onChange={(field, val) => setField(row.id, field, val)}
                                vals={vals}
                              />
                            </div>

                            <Field label="Nota interna" hint="opcional">
                              <textarea
                                className={`${inputCls} min-h-12 resize-y`}
                                onChange={(e) => setField(row.id, "note", e.target.value)}
                                placeholder="Explicación de la corrección o contexto extra…"
                                value={vals.note}
                              />
                            </Field>
                          </div>

                          {result ? (
                            <p
                              className={`rounded-lg px-3 py-2 text-sm ${
                                result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
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
                                <span className="text-red-600">Error al disparar reproceso: {reprocessResult[row.id].error}</span>
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
