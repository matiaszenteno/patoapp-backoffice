import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "../lib/supabase";
import { getFreshAccessToken } from "../lib/auth";
import { inputCls, selectCls } from "../lib/styles";

// ---------- Tipos ----------

type CampaignRow = {
  id: string;
  title: string;
  status: string;
  sent_count: number | null;
  created_at: string;
  sent_at: string | null;
};

type BenefitOption = {
  id: string;
  title: string;
  issuerName: string | null;
};

type CategoryOption = {
  slug: string;
  name: string;
};

type ProfileOption = {
  id: string;
  label: string;
};

const TITLE_MAX = 120;
const BODY_MAX = 300;

// ---------- Validación (espejo del contrato de `data`) ----------

const schema = z
  .object({
    title: z.string().min(1, "Requerido").max(TITLE_MAX, `Máximo ${TITLE_MAX} caracteres`),
    body: z.string().min(1, "Requerido").max(BODY_MAX, `Máximo ${BODY_MAX} caracteres`),
    dest: z.enum(["benefit", "feed", "nearby"]),
    benefit_id: z.string(),
    feedFilter: z.enum(["none", "category", "query"]),
    category_slug: z.string(),
    query: z.string(),
    audience: z.enum(["all", "users"]),
    target_user_ids: z.array(z.string()),
  })
  .superRefine((val, ctx) => {
    if (val.dest === "benefit" && !val.benefit_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["benefit_id"], message: "Seleccioná un beneficio." });
    }
    if (val.dest === "feed" && val.feedFilter === "category" && !val.category_slug) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["category_slug"], message: "Seleccioná una categoría." });
    }
    if (val.dest === "feed" && val.feedFilter === "query" && !val.query.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["query"], message: "Ingresá un término de búsqueda." });
    }
    if (val.dest === "feed" && val.feedFilter === "category" && val.query.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["query"], message: "categoría y búsqueda son excluyentes." });
    }
    if (val.audience === "users" && val.target_user_ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["target_user_ids"], message: "Elegí al menos un usuario." });
    }
  });

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  title: "",
  body: "",
  dest: "feed",
  benefit_id: "",
  feedFilter: "none",
  category_slug: "",
  query: "",
  audience: "all",
  target_user_ids: [],
};

function buildData(values: FormValues): Record<string, unknown> {
  if (values.dest === "benefit") {
    return { dest: "benefit", benefit_id: values.benefit_id };
  }
  if (values.dest === "feed") {
    if (values.feedFilter === "category") return { dest: "feed", category_slug: values.category_slug };
    if (values.feedFilter === "query") return { dest: "feed", query: values.query.trim() };
    return { dest: "feed" };
  }
  return { dest: "nearby" };
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending": return "Pendiente";
    case "sending": return "Enviando";
    case "sent": return "Enviada";
    case "failed": return "Falló";
    default: return status;
  }
}

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
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

// ---------- Lista de campañas ----------

function CampaignsList({ campaigns, loading }: { campaigns: CampaignRow[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3">Título</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Enviadas</th>
            <th className="px-4 py-3">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium text-stone-900">{c.title}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded border px-2 py-0.5 text-xs ${
                    c.status === "sent"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : c.status === "failed"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-stone-200 bg-stone-100 text-stone-500"
                  }`}
                >
                  {statusLabel(c.status)}
                </span>
              </td>
              <td className="px-4 py-3 text-stone-500">{c.sent_count ?? "—"}</td>
              <td className="px-4 py-3 text-stone-500">
                {(c.sent_at ?? c.created_at).substring(0, 16).replace("T", " ")}
              </td>
            </tr>
          ))}
          {!loading && campaigns.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-stone-400" colSpan={4}>
                Sin campañas todavía
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {loading && <p className="py-4 text-center text-sm text-stone-400">Cargando...</p>}
    </div>
  );
}

// ---------- Formulario de creación ----------

function CampaignForm({ onCreated }: { onCreated: () => void }) {
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const title = watch("title");
  const body = watch("body");
  const dest = watch("dest");
  const feedFilter = watch("feedFilter");
  const audience = watch("audience");

  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const [benefitSearch, setBenefitSearch] = useState("");
  const [benefitResults, setBenefitResults] = useState<BenefitOption[]>([]);
  const [selectedBenefit, setSelectedBenefit] = useState<BenefitOption | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<ProfileOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<ProfileOption[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("categories")
      .select("slug, name")
      .order("name")
      .then(({ data }) => setCategories((data as CategoryOption[] | null) ?? []));
  }, []);

  // Autocomplete de beneficios publicados (status='active'), por título.
  useEffect(() => {
    const term = benefitSearch.trim();
    if (term.length < 2 || selectedBenefit) {
      setBenefitResults([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("benefits")
        .select("id, title, status, issuers(name)")
        .eq("status", "active")
        .ilike("title", `%${term}%`)
        .limit(10);
      if (!active) return;
      setBenefitResults(
        (data ?? []).map((b) => ({
          id: b.id as string,
          title: b.title as string,
          issuerName: (b.issuers as unknown as { name: string } | null)?.name ?? null,
        })),
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [benefitSearch, selectedBenefit]);

  // Autocomplete de usuarios vía RPC admin_search_profiles (SECURITY DEFINER,
  // guardada por is_developer_email()): busca por nombre o correo y devuelve
  // ambos, sin exponer profiles ni auth.users al browser. profiles.full_name
  // puede ser null; el correo viene de auth.users.
  useEffect(() => {
    const term = userSearch.trim();
    if (term.length < 2) {
      setUserResults([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      const { data } = await supabase.rpc("admin_search_profiles", {
        search: term,
        max_results: 10,
      });
      if (!active) return;
      const already = new Set(selectedUsers.map((u) => u.id));
      setUserResults(
        ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
          .filter((p) => !already.has(p.id))
          .map((p) => ({
            id: p.id,
            label: `${p.full_name ?? "Sin nombre"} — ${p.email ?? "sin correo"}`,
          })),
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [userSearch, selectedUsers]);

  const pickBenefit = (b: BenefitOption) => {
    setSelectedBenefit(b);
    setValue("benefit_id", b.id, { shouldValidate: true });
    setBenefitSearch("");
    setBenefitResults([]);
  };

  const clearBenefit = () => {
    setSelectedBenefit(null);
    setValue("benefit_id", "", { shouldValidate: true });
  };

  const changeDestination = (next: FormValues["dest"]) => {
    if (next !== "benefit") {
      setSelectedBenefit(null);
      setBenefitSearch("");
      setBenefitResults([]);
      setValue("benefit_id", "", { shouldValidate: false });
      clearErrors("benefit_id");
    }

    if (next !== "feed") {
      setValue("feedFilter", "none", { shouldValidate: false });
      setValue("category_slug", "", { shouldValidate: false });
      setValue("query", "", { shouldValidate: false });
      clearErrors(["category_slug", "query"]);
    }

    setValue("dest", next, { shouldValidate: true });
  };

  const changeFeedFilter = (next: FormValues["feedFilter"]) => {
    if (next !== "category") {
      setValue("category_slug", "", { shouldValidate: false });
      clearErrors("category_slug");
    }
    if (next !== "query") {
      setValue("query", "", { shouldValidate: false });
      clearErrors("query");
    }
    setValue("feedFilter", next, { shouldValidate: true });
  };

  const addUser = (u: ProfileOption) => {
    const next = [...selectedUsers, u];
    setSelectedUsers(next);
    setValue("target_user_ids", next.map((x) => x.id), { shouldValidate: true });
    setUserSearch("");
    setUserResults([]);
  };

  const removeUser = (id: string) => {
    const next = selectedUsers.filter((u) => u.id !== id);
    setSelectedUsers(next);
    setValue("target_user_ids", next.map((x) => x.id), { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payload = {
      title: values.title.trim(),
      body: values.body.trim(),
      data: buildData(values),
      target: values.audience,
      target_user_ids: values.audience === "users" ? values.target_user_ids : null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("notification_campaigns")
      .insert(payload)
      .select("id")
      .single();

    if (insertError || !inserted) {
      setSubmitting(false);
      setErrorMsg(insertError?.message ?? "No se pudo crear la campaña.");
      return;
    }

    const token = await getFreshAccessToken();
    if (!token) {
      setSubmitting(false);
      setErrorMsg("Campaña creada, pero no se pudo enviar: no autenticado.");
      onCreated();
      return;
    }

    const { error: fnError } = await supabase.functions.invoke("send-campaign", {
      body: { campaign_id: inserted.id },
      headers: { Authorization: `Bearer ${token}` },
    });

    setSubmitting(false);
    if (fnError) {
      setErrorMsg(`Campaña creada, pero falló el envío: ${fnError.message}`);
    } else {
      setSuccessMsg("Campaña creada y enviada.");
      reset(defaultValues);
      setSelectedBenefit(null);
      setSelectedUsers([]);
    }
    onCreated();
  });

  return (
    <form className="flex flex-col gap-6 rounded-lg border border-stone-200 bg-white p-6" onSubmit={onSubmit}>
      <h2 className="text-base font-semibold text-stone-900">Nueva campaña</h2>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field error={errors.title?.message} label={`Título * (${title.length}/${TITLE_MAX})`}>
          <input className={inputCls} maxLength={TITLE_MAX} placeholder="Título de la notificación" {...register("title")} />
        </Field>
      </div>

      <Field error={errors.body?.message} label={`Mensaje * (${body.length}/${BODY_MAX})`}>
        <textarea
          className={`${inputCls} min-h-20 resize-y`}
          maxLength={BODY_MAX}
          placeholder="Cuerpo de la notificación"
          {...register("body")}
        />
      </Field>

      {/* ---------- Destino ---------- */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-stone-700">Destino</p>
        <div className="flex flex-wrap gap-2">
          {([
            { value: "benefit", label: "Beneficio" },
            { value: "feed", label: "Feed" },
            { value: "nearby", label: "Nearby" },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                dest === opt.value ? "border-stone-900 bg-stone-100 font-medium text-stone-900" : "border-stone-200 text-stone-600 hover:border-stone-400"
              }`}
            >
              <input
                checked={dest === opt.value}
                className="h-4 w-4"
                onChange={() => changeDestination(opt.value)}
                type="radio"
                value={opt.value}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {dest === "benefit" && (
          <div className="flex flex-col gap-2 rounded-md border border-stone-200 p-3">
            {selectedBenefit ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-900">{selectedBenefit.title}</span>
                  <button className="text-xs text-stone-500 hover:text-stone-800" onClick={clearBenefit} type="button">
                    Cambiar
                  </button>
                </div>
                <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                  Llega solo a usuarios de {selectedBenefit.issuerName ?? "este emisor"}
                </div>
              </div>
            ) : (
              <>
                <input
                  className={inputCls}
                  onChange={(e) => setBenefitSearch(e.target.value)}
                  placeholder="Buscar beneficio publicado por título..."
                  type="search"
                  value={benefitSearch}
                />
                {benefitResults.length > 0 && (
                  <ul className="flex flex-col divide-y divide-stone-100 rounded-md border border-stone-200">
                    {benefitResults.map((b) => (
                      <li key={b.id}>
                        <button
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-stone-50"
                          onClick={() => pickBenefit(b)}
                          type="button"
                        >
                          <span className="font-medium text-stone-900">{b.title}</span>
                          <span className="text-xs text-stone-400">{b.issuerName ?? "—"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {errors.benefit_id && <p className="text-xs text-red-600">{errors.benefit_id.message}</p>}
          </div>
        )}

        {dest === "feed" && (
          <div className="flex flex-col gap-3 rounded-md border border-stone-200 p-3">
            <div className="flex flex-col gap-2">
              {([
                { value: "none", label: "Sin filtro" },
                { value: "category", label: "Por categoría" },
                { value: "query", label: "Por búsqueda" },
              ] as const).map((opt) => (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700" key={opt.value}>
                  <input
                    checked={feedFilter === opt.value}
                    className="h-4 w-4"
                    onChange={() => changeFeedFilter(opt.value)}
                    type="radio"
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {feedFilter === "category" && (
              <Field error={errors.category_slug?.message} label="Categoría">
                <select className={selectCls} {...register("category_slug")}>
                  <option value="">— seleccionar —</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </Field>
            )}

            {feedFilter === "query" && (
              <Field error={errors.query?.message} label="Búsqueda">
                <input className={inputCls} placeholder="ej: café" {...register("query")} />
              </Field>
            )}
          </div>
        )}

        {dest === "nearby" && (
          <p className="text-sm text-stone-500">Abre el mapa/cercanía, sin filtros adicionales.</p>
        )}
      </div>

      {/* ---------- Audiencia ---------- */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-stone-700">Audiencia</p>
        <div className="flex gap-2">
          {([
            { value: "all", label: "Todos" },
            { value: "users", label: "Usuarios específicos" },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                audience === opt.value ? "border-stone-900 bg-stone-100 font-medium text-stone-900" : "border-stone-200 text-stone-600 hover:border-stone-400"
              }`}
            >
              <input
                checked={audience === opt.value}
                className="h-4 w-4"
                onChange={() => setValue("audience", opt.value, { shouldValidate: true })}
                type="radio"
              />
              {opt.label}
            </label>
          ))}
        </div>

        {audience === "users" && (
          <div className="flex flex-col gap-2 rounded-md border border-stone-200 p-3">
            {selectedUsers.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {selectedUsers.map((u) => (
                  <li
                    className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs text-stone-700"
                    key={u.id}
                  >
                    {u.label}
                    <button className="text-stone-400 hover:text-stone-700" onClick={() => removeUser(u.id)} type="button">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              className={inputCls}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              type="search"
              value={userSearch}
            />
            {userResults.length > 0 && (
              <ul className="flex flex-col divide-y divide-stone-100 rounded-md border border-stone-200">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
                      onClick={() => addUser(u)}
                      type="button"
                    >
                      {u.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errors.target_user_ids && (
              <p className="text-xs text-red-600">{errors.target_user_ids.message as string}</p>
            )}
          </div>
        )}
      </div>

      {errorMsg && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>}
      {successMsg && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMsg}</p>
      )}

      <div>
        <button
          className="rounded-md bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Enviando..." : "Crear y enviar"}
        </button>
      </div>
    </form>
  );
}

// ---------- Página ----------

export function Notificaciones() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notification_campaigns")
      .select("id, title, status, sent_count, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setCampaigns((data as CampaignRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Notificaciones</h1>
        <p className="mt-0.5 text-sm text-stone-500">Campañas de push con deep-link a un destino de la app.</p>
      </div>

      <CampaignForm onCreated={loadCampaigns} />

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-stone-900">Historial</h2>
        <CampaignsList campaigns={campaigns} loading={loading} />
      </div>
    </div>
  );
}
