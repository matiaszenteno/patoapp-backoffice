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
  redemption_details: string;
  benefit_rules: string;
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

// Blockers that map to specific form fields (for highlighting)
const BLOCKER_FIELD_MAP: Record<string, keyof FormState> = {
  category_id_missing: "category_slug",
  channel_missing: "channel",
  ai_description_missing: "ai_description",
  needs_manual_review: "resolve_needs_review",
};

// Human-readable blocker labels
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  isBlocker,
  aiHint,
  children,
}: {
  label: string;
  isBlocker?: boolean;
  aiHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label
          className={`text-sm font-medium ${isBlocker ? "text-amber-700" : "text-gray-700"}`}
        >
          {label}
          {isBlocker && <span className="ml-1 text-amber-500">●</span>}
        </label>
        {aiHint && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            IA: {aiHint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Clasificacion() {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cardData, setCardData] = useState<Record<string, CardData>>({});
  const [loadingCards, setLoadingCards] = useState<Set<string>>(new Set());
  const [formValues, setFormValues] = useState<Record<string, FormState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveResult, setSaveResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
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

    const initial: FormState = {
      category_slug: String(existing?.category_slug ?? aiValues.category_slug ?? ""),
      channel: String(existing?.channel ?? aiValues.channel ?? ""),
      ai_description: String(existing?.ai_description ?? aiValues.ai_description ?? ""),
      resolve_needs_review: existing?.needs_review === false,
      value_type: String(existing?.value_type ?? aiValues.value_type ?? ""),
      value: String(existing?.value ?? aiValues.value ?? ""),
      redemption_method: String(existing?.redemption_method ?? ""),
      redemption_details: existing?.redemption_details
        ? JSON.stringify(existing.redemption_details, null, 2)
        : "",
      benefit_rules: existing?.benefit_rules
        ? JSON.stringify(existing.benefit_rules, null, 2)
        : "",
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
    if (vals.redemption_details.trim()) {
      try {
        cf.redemption_details = JSON.parse(vals.redemption_details);
      } catch {
        // invalid JSON — skip field
      }
    }
    if (vals.benefit_rules.trim()) {
      try {
        cf.benefit_rules = JSON.parse(vals.benefit_rules);
      } catch {
        // invalid JSON — skip field
      }
    }

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
    setSaveResult((prev) => ({
      ...prev,
      [rawId]: error
        ? { ok: false, msg: error.message }
        : {
            ok: true,
            msg: "Corrección guardada. El pipeline la aplicará en el próximo reproceso.",
          },
    }));
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
          const isExpanded = expanded.has(row.id);
          const data = cardData[row.id];
          const isLoadingCard = loadingCards.has(row.id);
          const vals = formValues[row.id];
          const isSaving = saving.has(row.id);
          const result = saveResult[row.id];

          // Determine which form fields are blockers
          const blockerFields = new Set(
            (data?.blockers ?? [])
              .map((b) => BLOCKER_FIELD_MAP[b])
              .filter(Boolean),
          );

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
                  {/* Blockers summary (always visible once loaded) */}
                  {data && data.blockers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {data.blockers.map((b) => (
                        <span
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                          key={b}
                        >
                          {BLOCKER_LABELS[b] ?? b}
                        </span>
                      ))}
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
                      {/* Raw payload reference */}
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Datos originales
                        </p>
                        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg bg-gray-50 p-3 text-sm md:grid-cols-2">
                          {[
                            "title",
                            "description",
                            "description_raw",
                            "merchant_name",
                            "category",
                            "channel",
                            "value_type",
                            "value",
                          ]
                            .filter((k) => payload[k] != null && String(payload[k]).trim() !== "")
                            .map((k) => (
                              <div className="flex gap-1.5" key={k}>
                                <span className="shrink-0 font-medium text-gray-500">{k}:</span>
                                <span className="text-gray-700 line-clamp-2">
                                  {String(payload[k])}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Correction form */}
                      {vals && (
                        <div className="flex flex-col gap-5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Correcciones
                          </p>

                          {/* Blocker fields */}
                          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <Field
                              aiHint={data?.aiValues.category_slug}
                              isBlocker={blockerFields.has("category_slug")}
                              label="Categoría"
                            >
                              <select
                                className={
                                  blockerFields.has("category_slug")
                                    ? blockerSelectCls
                                    : selectCls
                                }
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
                                className={
                                  blockerFields.has("channel") ? blockerSelectCls : selectCls
                                }
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
                                ? `${data.aiValues.ai_description.substring(0, 60)}…`
                                : undefined
                            }
                            isBlocker={blockerFields.has("ai_description")}
                            label="Descripción IA (máx. 150 chars)"
                          >
                            <textarea
                              className={`${blockerFields.has("ai_description") ? blockerInputCls : inputCls} min-h-16 resize-y`}
                              maxLength={150}
                              onChange={(e) => setField(row.id, "ai_description", e.target.value)}
                              placeholder="Descripción corta generada por IA"
                              value={vals.ai_description}
                            />
                            <p className="text-right text-xs text-gray-400">
                              {vals.ai_description.length}/150
                            </p>
                          </Field>

                          {/* needs_review resolution */}
                          {(blockerFields.has("resolve_needs_review") ||
                            data?.blockers.includes("needs_manual_review")) && (
                            <div
                              className={`flex items-start gap-3 rounded-lg p-3 ${
                                blockerFields.has("resolve_needs_review")
                                  ? "border border-amber-200 bg-amber-50"
                                  : "border border-gray-200 bg-gray-50"
                              }`}
                            >
                              <input
                                checked={vals.resolve_needs_review}
                                className="mt-0.5 h-4 w-4 accent-teal-600"
                                id={`resolve-${row.id}`}
                                onChange={(e) =>
                                  setField(row.id, "resolve_needs_review", e.target.checked)
                                }
                                type="checkbox"
                              />
                              <label
                                className="cursor-pointer text-sm text-gray-700"
                                htmlFor={`resolve-${row.id}`}
                              >
                                <span className="font-medium">Resolver revisión manual</span>
                                <span className="ml-1 text-gray-500">
                                  — marcar cuando la ambigüedad de reglas esté resuelta
                                </span>
                              </label>
                            </div>
                          )}

                          {/* Optional fields */}
                          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <Field
                              aiHint={data?.aiValues.value_type}
                              label="Tipo de valor"
                            >
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

                            <Field
                              aiHint={data?.aiValues.value}
                              label="Valor (ej: 15 para 15%)"
                            >
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
                                onChange={(e) =>
                                  setField(row.id, "redemption_method", e.target.value)
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
                          </div>

                          <Field label='Detalles de canje (JSON, ej: {"code":"RAUKA15"})'>
                            <textarea
                              className={`${inputCls} min-h-16 resize-y font-mono text-xs`}
                              onChange={(e) =>
                                setField(row.id, "redemption_details", e.target.value)
                              }
                              placeholder='{"code": "RAUKA15"}'
                              value={vals.redemption_details}
                            />
                          </Field>

                          <Field label="Reglas del beneficio (JSON)">
                            <textarea
                              className={`${inputCls} min-h-16 resize-y font-mono text-xs`}
                              onChange={(e) => setField(row.id, "benefit_rules", e.target.value)}
                              placeholder='{"tope_mensual": 5000, "dias_validos": ["lunes", "martes"]}'
                              value={vals.benefit_rules}
                            />
                          </Field>

                          <Field label="Nota interna (opcional)">
                            <textarea
                              className={`${inputCls} min-h-12 resize-y`}
                              onChange={(e) => setField(row.id, "note", e.target.value)}
                              placeholder="Explicación de la corrección…"
                              value={vals.note}
                            />
                          </Field>

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
