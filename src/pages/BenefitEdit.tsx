import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { inputCls, selectCls } from "../lib/styles";

type SelectOption = { value: string; label: string };
type MerchantOption = SelectOption & { imageUrl: string | null };

const VALUE_TYPE_OPTIONS: SelectOption[] = [
  { value: "", label: "N/A" },
  { value: "percentage", label: "Porcentaje" },
  { value: "fixed_amount", label: "Monto fijo" },
  { value: "free_item", label: "Producto gratis" },
  { value: "two_for_one", label: "2x1" },
  { value: "installments", label: "Cuotas" },
  { value: "cashback", label: "Cashback" },
  { value: "preventa_exclusiva", label: "Preventa exclusiva" },
  { value: "acceso_anticipado", label: "Acceso anticipado" },
];

const CHANNEL_OPTIONS: SelectOption[] = [
  { value: "", label: "N/A" },
  { value: "online", label: "Online" },
  { value: "physical", label: "Físico" },
  { value: "hybrid", label: "Híbrido" },
];

const REDEMPTION_METHOD_OPTIONS: SelectOption[] = [
  { value: "", label: "N/A" },
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

const STATUS_OPTIONS: SelectOption[] = [
  { value: "active", label: "Activo" },
  { value: "expired", label: "Expirado" },
];

const schema = z.object({
  title: z.string().min(1, "Requerido"),
  description_raw: z.string().min(1, "Requerido"),
  ai_description: z.string().optional(),
  merchant_id: z.string().optional(),
  image_url: z.string().optional(),
  source_url: z.string().optional(),
  issuer_id: z.string().min(1, "Requerido"),
  category_id: z.string().min(1, "Requerido para publicar"),
  value_type: z.string().optional(),
  value: z.string().optional(),
  channel: z.string().min(1, "Requerido para publicar"),
  redemption_method: z.string().optional(),
  redemption_details: z.string().optional(),
  benefit_rules: z.string().optional(),
  status: z.string().min(1),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-stone-700">{label}</label>
      {children}
      {error ? <p className="text-xs text-stone-500">{error}</p> : null}
    </div>
  );
}

function parseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
  const trimmed = value?.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} debe ser un objeto JSON.`);
  }
  return parsed as Record<string, unknown>;
}

export function BenefitEdit() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();

  const [issuers, setIssuers] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [loadingData, setLoadingData] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Raw ligado: si existe, el beneficio viene de scraping y el pipeline lo posee.
  const [rawBenefitId, setRawBenefitId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [opLoading, setOpLoading] = useState<Record<string, boolean>>({});
  const [opResults, setOpResults] = useState<Record<string, { ok?: Record<string, unknown>; error?: string }>>({});

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description_raw: "",
      ai_description: "",
      merchant_id: "",
      image_url: "",
      source_url: "",
      issuer_id: "",
      category_id: "",
      value_type: "",
      value: "",
      channel: "",
      redemption_method: "",
      redemption_details: "{}",
      benefit_rules: "{}",
      status: "active",
      starts_at: "",
      ends_at: "",
    },
  });

  const imageUrl = watch("image_url");
  const merchantId = watch("merchant_id");
  const selectedMerchant = merchants.find((merchant) => merchant.value === merchantId);
  const previewImageUrl = imageUrl?.trim() || selectedMerchant?.imageUrl || "";

  async function loadBenefitDetails(benefitId: string) {
    const { data } = await supabase
      .from("benefits")
      .select(
        "id, title, description_raw, ai_description, merchant_id, image_url, source_url, issuer_id, category_id, value_type, value, channel, redemption_method, redemption_details, benefit_rules, status, starts_at, ends_at",
      )
      .eq("id", benefitId)
      .maybeSingle();

    if (data) {
      reset({
        title: data.title ?? "",
        description_raw: data.description_raw ?? "",
        ai_description: data.ai_description ?? "",
        merchant_id: data.merchant_id ?? "",
        image_url: data.image_url ?? "",
        source_url: data.source_url ?? "",
        issuer_id: data.issuer_id ?? "",
        category_id: data.category_id ?? "",
        value_type: data.value_type ?? "",
        value: data.value != null ? String(data.value) : "",
        channel: data.channel ?? "",
        redemption_method: data.redemption_method ?? "",
        redemption_details: JSON.stringify(data.redemption_details ?? {}, null, 2),
        benefit_rules: JSON.stringify(data.benefit_rules ?? {}, null, 2),
        status: data.status ?? "active",
        starts_at: data.starts_at ? String(data.starts_at).substring(0, 10) : "",
        ends_at: data.ends_at ? String(data.ends_at).substring(0, 10) : "",
      });
    }
  }

  useEffect(() => {
    const load = async () => {
      const [{ data: issuerData }, { data: catData }, { data: merchantData }] = await Promise.all([
        supabase.from("issuers").select("id, name").order("name"),
        supabase.from("categories").select("id, name").order("name"),
        supabase.from("merchants").select("id, name, image_url").order("name"),
      ]);

      setIssuers([
        { value: "", label: "— seleccionar —" },
        ...(issuerData ?? []).map((i: { id: string; name: string }) => ({
          value: i.id,
          label: i.name,
        })),
      ]);
      setCategories([
        { value: "", label: "— sin categoría —" },
        ...(catData ?? []).map((c: { id: string; name: string }) => ({
          value: c.id,
          label: c.name,
        })),
      ]);
      setMerchants([
        { imageUrl: null, value: "", label: "— sin merchant —" },
        ...(merchantData ?? []).map((m: { id: string; image_url: string | null; name: string }) => ({
          imageUrl: m.image_url,
          value: m.id,
          label: m.name,
        })),
      ]);

      if (!isNew && id) {
        await loadBenefitDetails(id);
        const { data: rawRow } = await supabase
          .from("scraped_benefits_raw")
          .select("id")
          .eq("benefit_id", id)
          .maybeSingle();
        setRawBenefitId(rawRow?.id ?? null);
        setLoadingData(false);
      }
    };

    load();
  }, [id, isNew, reset]);

  // Beneficio de scraping: el pipeline es dueño de sus campos. Se edita read-only
  // y las correcciones de contenido van por el flujo de Clasificación (sobre el raw).
  const isScraped = !isNew && rawBenefitId !== null;

  const onSubmit = handleSubmit(async (values) => {
    if (isScraped) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let redemptionDetails: Record<string, unknown>;
    let benefitRules: Record<string, unknown>;
    try {
      redemptionDetails = parseJsonObject(values.redemption_details, "Detalles de canje");
      benefitRules = parseJsonObject(values.benefit_rules, "Reglas");
    } catch (error) {
      setSaving(false);
      setErrorMsg(error instanceof Error ? error.message : "JSON inválido.");
      return;
    }

    const payload = {
      title: values.title.trim(),
      description_raw: values.description_raw.trim(),
      ai_description: values.ai_description?.trim() || null,
      merchant_id: values.merchant_id || null,
      image_url: values.image_url?.trim() || null,
      source_url: values.source_url?.trim() || null,
      issuer_id: values.issuer_id,
      category_id: values.category_id || null,
      value_type: values.value_type || null,
      value: values.value ? Number(values.value) : null,
      channel: values.channel || null,
      redemption_method: values.redemption_method || null,
      redemption_details: redemptionDetails,
      benefit_rules: benefitRules,
      status: values.status,
      starts_at: values.starts_at || null,
      ends_at: values.ends_at || null,
    };

    if (isNew) {
      const manualId = crypto.randomUUID();
      const { data, error } = await supabase
        .from("benefits")
        .insert({ ...payload, source_url: payload.source_url ?? `manual://${manualId}` })
        .select("id")
        .single();

      setSaving(false);
      if (error) {
        setErrorMsg(error.message);
      } else {
        navigate(`/benefits/${data.id}`, { replace: true });
      }
    } else {
      const { error } = await supabase.from("benefits").update(payload).eq("id", id!);
      setSaving(false);
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg("Guardado correctamente.");
      }
    }
  });

  async function runOp(key: string, fn: string, body: Record<string, unknown>) {
    setOpLoading((s) => ({ ...s, [key]: true }));
    setOpResults((s) => ({ ...s, [key]: {} }));
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setOpLoading((s) => ({ ...s, [key]: false }));
      setOpResults((s) => ({ ...s, [key]: { error: "No autenticado." } }));
      return;
    }
    const { data, error } = await supabase.functions.invoke(fn, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!error && key === "ai_desc" && id) {
      await loadBenefitDetails(id);
    }
    setOpLoading((s) => ({ ...s, [key]: false }));
    setOpResults((s) => ({
      ...s,
      [key]: error ? { error: error.message } : { ok: data as Record<string, unknown> },
    }));
  }

  async function invokeManageBenefit(action: "delete" | "expire") {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { error: "No autenticado." };
    const { data, error } = await supabase.functions.invoke("manage-benefit", {
      body: { action, benefitId: id },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) return { error: error.message };
    const payload = data as { error?: string };
    if (payload?.error) return { error: payload.error };
    return {};
  }

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm("¿Eliminar este beneficio? Esta acción no se puede deshacer.")) return;

    setDeleting(true);
    const { error } = await invokeManageBenefit("delete");
    setDeleting(false);

    if (error) {
      setErrorMsg(error);
    } else {
      navigate("/benefits");
    }
  };

  const handleExpire = async () => {
    if (!id) return;
    if (!confirm("¿Expirar este beneficio ahora? Dejará de mostrarse como activo.")) return;
    setSaving(true);
    setErrorMsg(null);
    const { error } = await invokeManageBenefit("expire");
    setSaving(false);
    if (error) {
      setErrorMsg(error);
    } else {
      await loadBenefitDetails(id);
      setSuccessMsg("Beneficio expirado.");
    }
  };

  if (loadingData) {
    return <p className="text-stone-400 px-6 py-8">Cargando...</p>;
  }

  return (
    <div className="h-full overflow-y-auto max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          className="text-sm text-stone-500 hover:text-stone-900"
          onClick={() => navigate("/benefits")}
          type="button"
        >
          ← Volver
        </button>
        <h1 className="text-xl font-bold text-stone-900">
          {isNew ? "Nuevo beneficio" : "Editar beneficio"}
        </h1>
      </div>

      <form
        className="flex flex-col gap-5 rounded-lg border border-stone-200 bg-white p-6"
        onSubmit={onSubmit}
      >
        {isScraped && (
          <div className="flex flex-col gap-2 rounded-md border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-600">
            <p>
              Este beneficio viene de scraping; el pipeline es dueño de sus campos. Para corregir
              su contenido, hazlo como corrección sobre el raw (así el pipeline lo respeta y republica).
            </p>
            <button
              className="self-start rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-400 hover:text-stone-900"
              onClick={() => navigate(`/clasificacion?raw=${rawBenefitId}`)}
              type="button"
            >
              Corregir en Clasificación →
            </button>
          </div>
        )}

        <fieldset className="contents" disabled={isScraped}>
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="h-32 w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-50 md:w-48">
            {previewImageUrl ? (
              <img alt="" className="h-full w-full object-cover" src={previewImageUrl} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">Sin imagen</div>
            )}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="URL de imagen">
              <input className={inputCls} placeholder="https://..." type="url" {...register("image_url")} />
            </Field>
            <Field label="URL fuente">
              <input className={inputCls} placeholder="https://... o manual://..." {...register("source_url")} />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field error={errors.title?.message} label="Título *">
            <input className={inputCls} placeholder="Título del beneficio" {...register("title")} />
          </Field>

          <Field label="Merchant">
            <select className={selectCls} {...register("merchant_id")}>
              {merchants.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field error={errors.description_raw?.message} label="Descripción *">
          <textarea
            className={`${inputCls} min-h-24 resize-y`}
            placeholder="Descripción completa del beneficio"
            {...register("description_raw")}
          />
        </Field>

        <Field label="Descripción IA">
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            placeholder="Descripción corta generada por IA"
            {...register("ai_description")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field error={errors.issuer_id?.message} label="Emisor *">
            <select className={selectCls} {...register("issuer_id")}>
              {issuers.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field error={errors.category_id?.message} label="Categoría *">
            <select className={selectCls} {...register("category_id")}>
              {categories.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de valor">
            <select className={selectCls} {...register("value_type")}>
              {VALUE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Valor">
            <input
              className={inputCls}
              placeholder="ej: 20"
              step="any"
              type="number"
              {...register("value")}
            />
          </Field>

          <Field error={errors.channel?.message} label="Canal *">
            <select className={selectCls} {...register("channel")}>
              {CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Método de canje">
            <select className={selectCls} {...register("redemption_method")}>
              {REDEMPTION_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Estado">
            <select className={selectCls} {...register("status")}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fecha de inicio">
            <input className={inputCls} type="date" {...register("starts_at")} />
          </Field>

          <Field label="Fecha de vencimiento">
            <input className={inputCls} type="date" {...register("ends_at")} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Detalles de canje JSON">
            <textarea className={`${inputCls} min-h-24 resize-y font-mono`} {...register("redemption_details")} />
          </Field>
          <Field label="Reglas JSON">
            <textarea className={`${inputCls} min-h-24 resize-y font-mono`} {...register("benefit_rules")} />
          </Field>
        </div>
        </fieldset>

        {errorMsg ? (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">{errorMsg}</p>
        ) : null}
        {successMsg ? (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">{successMsg}</p>
        ) : null}

        <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
          {!isScraped && (
            <button
              className="rounded-md bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Guardando..." : isNew ? "Crear beneficio" : "Guardar cambios"}
            </button>
          )}

          {!isNew && (
            <button
              className="rounded-md border border-stone-200 px-5 py-2 text-sm font-medium text-stone-500 hover:border-stone-400 hover:text-stone-800 disabled:opacity-60"
              disabled={saving}
              onClick={handleExpire}
              type="button"
            >
              Expirar beneficio
            </button>
          )}

          {!isNew && (
            <button
              className="ml-auto rounded-md border border-stone-200 px-5 py-2 text-sm font-medium text-stone-500 hover:border-stone-400 hover:text-stone-800 disabled:opacity-60"
              disabled={deleting}
              onClick={handleDelete}
              type="button"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          )}
        </div>
      </form>

      {!isNew && (
        <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-base font-semibold text-stone-900">Operaciones</h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <button
                className="rounded-md border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-400 hover:text-stone-900 disabled:opacity-60"
                disabled={opLoading["ai_desc"]}
                onClick={() => runOp("ai_desc", "run-refresh-ai-descriptions", { benefitIds: [id], force: true })}
                title="Regenera la descripción corta de IA para este beneficio"
                type="button"
              >
                {opLoading["ai_desc"] ? "Generando..." : "Regenerar descripción con IA"}
              </button>
              {opResults["ai_desc"]?.error && (
                <p className="text-xs text-stone-500">{opResults["ai_desc"].error}</p>
              )}
              {opResults["ai_desc"]?.ok && (
                <p className="text-xs text-stone-500">
                  {JSON.stringify(opResults["ai_desc"].ok)}
                </p>
              )}
            </div>
            {isScraped && (
              <div className="flex flex-col gap-1">
                <button
                  className="rounded-md border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-400 hover:text-stone-900 disabled:opacity-60"
                  disabled={opLoading["reprocess"]}
                  onClick={() => runOp("reprocess", "run-reprocess", { benefitId: id, force: true })}
                  title="Reprocesa el raw completo con IA desde cero y republica el beneficio"
                  type="button"
                >
                  {opLoading["reprocess"] ? "Disparando..." : "Reprocesar raw con IA"}
                </button>
                {opResults["reprocess"]?.error && (
                  <p className="text-xs text-stone-500">{opResults["reprocess"].error}</p>
                )}
                {opResults["reprocess"]?.ok && (
                  <p className="text-xs text-stone-500">Pipeline disparado. Ver estado en GitHub Actions.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
