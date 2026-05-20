import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "../lib/supabase";

type SelectOption = { value: string; label: string };

const VALUE_TYPE_OPTIONS: SelectOption[] = [
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

const CHANNEL_OPTIONS: SelectOption[] = [
  { value: "", label: "— sin canal —" },
  { value: "online", label: "Online" },
  { value: "physical", label: "Físico" },
  { value: "hybrid", label: "Híbrido" },
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
  issuer_id: z.string().min(1, "Requerido"),
  category_id: z.string().optional(),
  value_type: z.string().optional(),
  value: z.string().optional(),
  channel: z.string().optional(),
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
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500";
const selectCls = `${inputCls} bg-white`;

export function BenefitEdit() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();

  const [issuers, setIssuers] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [merchants, setMerchants] = useState<SelectOption[]>([]);
  const [loadingData, setLoadingData] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [opLoading, setOpLoading] = useState<Record<string, boolean>>({});
  const [opResults, setOpResults] = useState<Record<string, { ok?: Record<string, unknown>; error?: string }>>({});

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description_raw: "",
      ai_description: "",
      merchant_id: "",
      image_url: "",
      issuer_id: "",
      category_id: "",
      value_type: "",
      value: "",
      channel: "",
      status: "active",
      starts_at: "",
      ends_at: "",
    },
  });

  useEffect(() => {
    const loadOptions = async () => {
      const [{ data: issuerData }, { data: catData }, { data: merchantData }] = await Promise.all([
        supabase.from("issuers").select("id, name").order("name"),
        supabase.from("categories").select("id, name").order("name"),
        supabase.from("merchants").select("id, name").order("name"),
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
        { value: "", label: "— sin merchant —" },
        ...(merchantData ?? []).map((m: { id: string; name: string }) => ({
          value: m.id,
          label: m.name,
        })),
      ]);
    };

    loadOptions();

    if (!isNew && id) {
      supabase
        .from("benefits")
        .select(
          "id, title, description_raw, ai_description, merchant_id, image_url, issuer_id, category_id, value_type, value, channel, status, starts_at, ends_at",
        )
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            reset({
              title: data.title ?? "",
              description_raw: data.description_raw ?? "",
              ai_description: data.ai_description ?? "",
              merchant_id: data.merchant_id ?? "",
              image_url: data.image_url ?? "",
              issuer_id: data.issuer_id ?? "",
              category_id: data.category_id ?? "",
              value_type: data.value_type ?? "",
              value: data.value != null ? String(data.value) : "",
              channel: data.channel ?? "",
              status: data.status ?? "active",
              starts_at: data.starts_at ? String(data.starts_at).substring(0, 10) : "",
              ends_at: data.ends_at ? String(data.ends_at).substring(0, 10) : "",
            });
          }
          setLoadingData(false);
        });
    }
  }, [id, isNew, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payload = {
      title: values.title.trim(),
      description_raw: values.description_raw.trim(),
      ai_description: values.ai_description?.trim() || null,
      merchant_id: values.merchant_id || null,
      image_url: values.image_url?.trim() || null,
      issuer_id: values.issuer_id,
      category_id: values.category_id || null,
      value_type: values.value_type || null,
      value: values.value ? Number(values.value) : null,
      channel: values.channel || null,
      status: values.status,
      starts_at: values.starts_at || null,
      ends_at: values.ends_at || null,
    };

    if (isNew) {
      const manualId = crypto.randomUUID();
      const { data, error } = await supabase
        .from("benefits")
        .insert({ ...payload, source_url: `manual://${manualId}` })
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
    setOpLoading((s) => ({ ...s, [key]: false }));
    setOpResults((s) => ({
      ...s,
      [key]: error ? { error: error.message } : { ok: data as Record<string, unknown> },
    }));
  }

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm("¿Eliminar este beneficio? Esta acción no se puede deshacer.")) return;

    setDeleting(true);
    const { error } = await supabase.from("benefits").delete().eq("id", id);
    setDeleting(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      navigate("/benefits");
    }
  };

  if (loadingData) {
    return <p className="text-gray-400">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          className="text-sm text-teal-700 hover:underline"
          onClick={() => navigate("/benefits")}
          type="button"
        >
          ← Volver
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {isNew ? "Nuevo beneficio" : "Editar beneficio"}
        </h1>
      </div>

      <form
        className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-6"
        onSubmit={onSubmit}
      >
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

        <Field label="URL de imagen">
          <input className={inputCls} placeholder="https://..." type="url" {...register("image_url")} />
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

          <Field label="Categoría">
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

          <Field label="Canal">
            <select className={selectCls} {...register("channel")}>
              {CHANNEL_OPTIONS.map((o) => (
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

        {errorMsg ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
        ) : null}
        {successMsg ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMsg}</p>
        ) : null}

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <button
            className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Guardando..." : isNew ? "Crear beneficio" : "Guardar cambios"}
          </button>

          {!isNew && (
            <button
              className="rounded-lg border border-red-200 px-5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
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
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900">Operaciones</h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <button
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                disabled={opLoading["reprocess"]}
                onClick={() => runOp("reprocess", "run-reprocess", { benefitId: id, force: true })}
                title="Corre el pipeline de ingestion para este beneficio específico vía GitHub Actions"
                type="button"
              >
                {opLoading["reprocess"] ? "Disparando..." : "Reprocesar este beneficio"}
              </button>
              {opResults["reprocess"]?.error && (
                <p className="text-xs text-red-600">{opResults["reprocess"].error}</p>
              )}
              {opResults["reprocess"]?.ok && (
                opResults["reprocess"].ok.runUrl ? (
                  <a className="text-xs text-teal-600 underline" href={opResults["reprocess"].ok.runUrl as string} rel="noreferrer" target="_blank">
                    Ver en GitHub Actions →
                  </a>
                ) : (
                  <p className="text-xs text-emerald-700">OK: {JSON.stringify(opResults["reprocess"].ok)}</p>
                )
              )}
            </div>

            <div className="flex flex-col gap-1">
              <button
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                disabled={opLoading["ai_desc"]}
                onClick={() => runOp("ai_desc", "run-refresh-ai-descriptions", { benefitIds: [id], force: true })}
                title="Regenera la descripción corta de IA para este beneficio usando GPT-4o mini"
                type="button"
              >
                {opLoading["ai_desc"] ? "Generando..." : "Refresh descripción IA"}
              </button>
              {opResults["ai_desc"]?.error && (
                <p className="text-xs text-red-600">{opResults["ai_desc"].error}</p>
              )}
              {opResults["ai_desc"]?.ok && (
                <p className="text-xs text-emerald-700">
                  {JSON.stringify(opResults["ai_desc"].ok)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
