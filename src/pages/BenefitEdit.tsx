import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { getFunctionErrorMessage } from "../lib/correctionReprocess";
import { getFreshAccessToken } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { inputCls, selectCls } from "../lib/styles";

type SelectOption = { value: string; label: string };
type MerchantOption = SelectOption & { imageUrl: string | null };
type CategoryOption = SelectOption & { slug: string };

const VALUE_TYPE_OPTIONS: SelectOption[] = [
  { value: "", label: "N/A" },
  { value: "percentage", label: "Porcentaje" },
  { value: "fixed_amount", label: "Monto fijo" },
  { value: "free_item", label: "Producto gratis" },
  { value: "two_for_one", label: "2x1" },
  { value: "installments", label: "Cuotas" },
  { value: "cashback", label: "Cashback" },
  { value: "preferred_price", label: "Precio preferencial" },
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

const schema = z.object({
  title: z.string().min(1, "Requerido"),
  description_raw: z.string().min(1, "Requerido"),
  terms: z.string().optional(),
  merchant_id: z.string().min(1, "Requerido"),
  image_url: z.string().optional(),
  category_id: z.string().optional(),
  value_type: z.string().optional(),
  value: z.string().optional(),
  channel: z.string().optional(),
  redemption_method: z.string().optional(),
  redemption_details: z.string().optional(),
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

const OWN_BENEFIT_URL_RE = /^https:\/\/patoapp\.cl\/beneficios\/([0-9a-f-]{36})$/i;

function getOwnBenefitKey(sourceUrl: string | null | undefined): string | null {
  return sourceUrl?.match(OWN_BENEFIT_URL_RE)?.[1] ?? null;
}

type ManageBenefitResponse = {
  benefitKey?: string;
  error?: string;
  requestId?: string;
  requires_reprocess?: boolean;
  runUrl?: string;
  triggered?: boolean;
};

export function BenefitEdit() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [loadingData, setLoadingData] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Raw ligado: si existe, el beneficio viene de scraping y el pipeline lo posee.
  const [rawBenefitId, setRawBenefitId] = useState<string | null>(null);
  const [ownBenefitKey, setOwnBenefitKey] = useState<string | null>(null);
  const [createdOwnBenefit, setCreatedOwnBenefit] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [opLoading, setOpLoading] = useState<Record<string, boolean>>({});
  const [opResults, setOpResults] = useState<Record<string, { ok?: Record<string, unknown>; error?: string }>>({});

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description_raw: "",
      terms: "",
      merchant_id: "",
      image_url: "",
      category_id: "",
      value_type: "",
      value: "",
      channel: "",
      redemption_method: "",
      redemption_details: "{}",
      starts_at: "",
      ends_at: "",
    },
  });

  const imageUrl = watch("image_url");
  const merchantId = watch("merchant_id");
  const selectedMerchant = merchants.find((merchant) => merchant.value === merchantId);
  const previewImageUrl = imageUrl?.trim() || selectedMerchant?.imageUrl || "";

  async function loadBenefitDetails(benefitId: string): Promise<string | null> {
    const { data } = await supabase
      .from("benefits")
      .select(
        "id, title, description_raw, merchant_id, image_url, source_url, category_id, value_type, value, channel, redemption_method, redemption_details, starts_at, ends_at",
      )
      .eq("id", benefitId)
      .maybeSingle();

    if (data) {
      reset({
        title: data.title ?? "",
        description_raw: data.description_raw ?? "",
        terms: "",
        merchant_id: data.merchant_id ?? "",
        image_url: data.image_url ?? "",
        category_id: data.category_id ?? "",
        value_type: data.value_type ?? "",
        value: data.value != null ? String(data.value) : "",
        channel: data.channel ?? "",
        redemption_method: data.redemption_method ?? "",
        redemption_details: JSON.stringify(data.redemption_details ?? {}, null, 2),
        starts_at: data.starts_at ? String(data.starts_at).substring(0, 10) : "",
        ends_at: data.ends_at ? String(data.ends_at).substring(0, 10) : "",
      });
    }
    return data?.source_url ?? null;
  }

  useEffect(() => {
    const load = async () => {
      const [{ data: catData }, { data: merchantData }] = await Promise.all([
        supabase.from("categories").select("id, name, slug").order("name"),
        supabase.from("merchants").select("id, name, image_url").order("name"),
      ]);

      setCategories([
        { slug: "", value: "", label: "— dejar que el pipeline resuelva —" },
        ...(catData ?? []).map((c: { id: string; name: string; slug: string }) => ({
          slug: c.slug,
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
        const benefitSourceUrl = await loadBenefitDetails(id);
        const { data: rawRow } = await supabase
          .from("scraped_benefits_raw")
          .select("id, issuer_slug, source_url, raw_payload")
          .eq("benefit_id", id)
          .maybeSingle();
        setRawBenefitId(rawRow?.id ?? null);
        const rawPayload = rawRow?.raw_payload as { terms?: unknown } | null;
        if (rawRow?.issuer_slug === "pato" && typeof rawPayload?.terms === "string") {
          setValue("terms", rawPayload.terms);
        }
        setOwnBenefitKey(
          rawRow?.issuer_slug === "pato"
            ? getOwnBenefitKey(rawRow.source_url ?? benefitSourceUrl)
            : null,
        );
        setLoadingData(false);
      }
    };

    load();
  }, [id, isNew, reset, setValue]);

  // La fuente de un beneficio propio es el raw manual; el formulario la actualiza
  // por manage-benefit. Cualquier otro beneficio publicado se corrige sobre su raw.
  const isOwnBenefit = !isNew && ownBenefitKey !== null;
  const isScraped = !isNew && rawBenefitId !== null && !isOwnBenefit;
  const isEditable = (isNew && !createdOwnBenefit) || isOwnBenefit;

  const onSubmit = handleSubmit(async (values) => {
    if (!isEditable) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let redemptionDetails: Record<string, unknown>;
    try {
      redemptionDetails = parseJsonObject(values.redemption_details, "Detalles de canje");
    } catch (error) {
      setSaving(false);
      setErrorMsg(error instanceof Error ? error.message : "JSON inválido.");
      return;
    }

    const selectedCategory = categories.find((category) => category.value === values.category_id);
    const selectedMerchantForSave = merchants.find((merchant) => merchant.value === values.merchant_id);
    if (!selectedMerchantForSave?.value) {
      setSaving(false);
      setErrorMsg("Selecciona un comercio para cargar el beneficio propio.");
      return;
    }

    const rawValue = values.value?.trim();
    const parsedValue = rawValue ? Number(rawValue) : undefined;
    if (parsedValue !== undefined && !Number.isFinite(parsedValue)) {
      setSaving(false);
      setErrorMsg("El valor debe ser un número válido.");
      return;
    }

    const benefit = {
      title: values.title.trim(),
      merchantName: selectedMerchantForSave.label,
      description: values.description_raw.trim(),
      terms: values.terms?.trim() || undefined,
      imageUrl: values.image_url?.trim() || undefined,
      merchantImageUrl: selectedMerchantForSave.imageUrl ?? undefined,
      categorySlug: selectedCategory?.slug || undefined,
      valueType: values.value_type || undefined,
      value: parsedValue,
      channel: values.channel || undefined,
      redemptionMethod: values.redemption_method || undefined,
      redemptionDetails,
      startsAt: values.starts_at || undefined,
      endsAt: values.ends_at || undefined,
    };

    const action = isNew ? "createOwn" : "updateOwn";
    const result = await invokeManageOwn(action, {
      ...benefit,
      ...(isOwnBenefit ? { benefitKey: ownBenefitKey! } : {}),
    });
    setSaving(false);
    if (result.error) {
      setErrorMsg(result.error);
      return;
    }

    if (isNew) {
      setOwnBenefitKey(result.benefitKey ?? null);
      setCreatedOwnBenefit(true);
      setSuccessMsg(
        result.triggered
          ? "Beneficio cargado y reproceso iniciado. Aparecerá en el listado cuando el pipeline termine."
          : "Beneficio cargado. No hubo cambios pendientes de reproceso.",
      );
      return;
    }
    setSuccessMsg(
      result.triggered
        ? "Cambios guardados y reproceso iniciado. El beneficio publicado se actualizará al terminar."
        : "No había cambios que reprocesar.",
    );
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
    setOpLoading((s) => ({ ...s, [key]: false }));
    setOpResults((s) => ({
      ...s,
      [key]: error ? { error: error.message } : { ok: data as Record<string, unknown> },
    }));
  }

  async function invokeManageOwn(
    action: "createOwn" | "updateOwn",
    benefit: Record<string, unknown>,
  ): Promise<ManageBenefitResponse> {
    const token = await getFreshAccessToken();
    if (!token) return { error: "No autenticado." };
    const { data, error } = await supabase.functions.invoke("manage-benefit", {
      body: { action, benefit },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) return { error: await getFunctionErrorMessage(error) };
    const response = data as ManageBenefitResponse | null;
    return response?.error ? response : (response ?? {});
  }

  async function invokeManageBenefit(action: "delete" | "expire") {
    const token = await getFreshAccessToken();
    if (!token) return { error: "No autenticado." };
    const { data, error } = await supabase.functions.invoke("manage-benefit", {
      body: { action, benefitId: id },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) return { error: await getFunctionErrorMessage(error) };
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
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
        {isNew && (
          <div className="rounded-md border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-600">
            {createdOwnBenefit
              ? "La carga ya fue enviada. No la reintentes: el listado se actualiza cuando termine el reproceso."
              : "Este beneficio se carga como fuente propia de Pato y pasa por el pipeline normal. El listado se actualiza cuando termine el reproceso."}
          </div>
        )}
        {isOwnBenefit && (
          <div className="rounded-md border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-600">
            Estás editando la fuente de este beneficio propio. Al guardar, el pipeline reprocesará y actualizará la publicación.
          </div>
        )}
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
        {!isNew && !isOwnBenefit && !isScraped && (
          <div className="rounded-md border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-600">
            Este beneficio no tiene una fuente propia de Pato recuperable. Para no escribir directamente la publicación, su contenido no se puede editar desde aquí.
          </div>
        )}

        <fieldset className="contents" disabled={!isEditable}>
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="h-32 w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-50 md:w-48">
            {previewImageUrl ? (
              <img alt="" className="h-full w-full object-cover" src={previewImageUrl} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">Sin imagen</div>
            )}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-5">
            <Field label="URL de imagen">
              <input className={inputCls} placeholder="https://..." type="url" {...register("image_url")} />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field error={errors.title?.message} label="Título *">
            <input className={inputCls} placeholder="Título del beneficio" {...register("title")} />
          </Field>

          <Field error={errors.merchant_id?.message} label="Comercio *">
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

        <Field label="Términos y condiciones">
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            placeholder="Restricciones, topes, vigencia y condiciones de uso"
            {...register("terms")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Field error={errors.category_id?.message} label="Categoría">
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

          <Field error={errors.channel?.message} label="Canal">
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

          <Field label="Fecha de inicio">
            <input className={inputCls} type="date" {...register("starts_at")} />
          </Field>

          <Field label="Fecha de vencimiento">
            <input className={inputCls} type="date" {...register("ends_at")} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5">
          <Field label="Detalles de canje JSON">
            <textarea className={`${inputCls} min-h-24 resize-y font-mono`} {...register("redemption_details")} />
          </Field>
        </div>
        </fieldset>

        {errorMsg ? (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">{errorMsg}</p>
        ) : null}
        {successMsg ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
            <p>{successMsg}</p>
            {isNew && createdOwnBenefit ? (
              <button className="shrink-0 underline hover:text-stone-900" onClick={() => navigate("/benefits")} type="button">
                Ver beneficios
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
          {isEditable && (
            <button
              className="rounded-md bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Guardando..." : isNew ? "Cargar beneficio" : "Guardar cambios"}
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
    </div>
  );
}
