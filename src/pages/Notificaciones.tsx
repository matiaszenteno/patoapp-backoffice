import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "../lib/supabase";
import { getFreshAccessToken } from "../lib/auth";
import { inputCls, selectCls } from "../lib/styles";
import { PersonalizedNotifications } from "../components/notifications/PersonalizedNotifications";
import {
  acceptedByExpo,
  acceptedByProvider,
  BODY_MAX,
  buildCampaignData,
  type CampaignDeliveryCounts,
  type CampaignFormValues,
  type CampaignSendResponse,
  createCampaignSchema,
  DEFAULT_SEARCH_MIN_QUERY_LENGTH,
  defaultCampaignValues,
  describeCampaignSendResult,
  pendingDelivery,
  TITLE_MAX,
  totalFailed,
} from "../lib/notificationCampaigns";

// ---------- Tipos ----------

type CampaignRow = {
  id: string;
  title: string;
  status: string;
  sent_count: number | null;
  created_at: string;
  sent_at: string | null;
  error_message: string | null;
  deliveryCounts?: CampaignDeliveryCounts;
};

type BenefitOption = {
  id: string;
  title: string;
  issuerName: string | null;
  issuerType: string | null;
};

type CategoryOption = {
  slug: string;
  name: string;
};

type ProfileOption = {
  id: string;
  label: string;
};

type ReceiptReconciliationSummary = {
  candidates?: number;
  receiptOk?: number;
  receiptFailed?: number;
  receiptsMissing?: number;
};

function statusLabel(status: string): string {
  switch (status) {
    case "pending": return "Pendiente";
    case "sending": return "Enviando";
    case "sent": return "Procesada";
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
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3">Título</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Expo aceptó</th>
            <th className="px-4 py-3">Proveedor OK</th>
            <th className="px-4 py-3">Pendientes</th>
            <th className="px-4 py-3">Fallidas</th>
            <th className="px-4 py-3">Omitidas</th>
            <th className="px-4 py-3">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td className="min-w-52 px-4 py-3 font-medium text-stone-900">
                {c.title}
                {c.error_message ? <p className="mt-1 text-xs font-normal text-red-600">{c.error_message}</p> : null}
              </td>
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
              <td className="px-4 py-3 text-stone-500">
                {c.deliveryCounts ? acceptedByExpo(c.deliveryCounts) : (c.sent_count ?? "—")}
              </td>
              <td className="px-4 py-3 text-stone-500">
                {c.deliveryCounts ? acceptedByProvider(c.deliveryCounts) : "—"}
              </td>
              <td className="px-4 py-3 text-stone-500">
                {c.deliveryCounts ? pendingDelivery(c.deliveryCounts) : "—"}
              </td>
              <td className="px-4 py-3 text-stone-500">
                {c.deliveryCounts ? totalFailed(c.deliveryCounts) : "—"}
              </td>
              <td className="px-4 py-3 text-stone-500">
                {c.deliveryCounts?.skipped ?? "—"}
              </td>
              <td className="px-4 py-3 text-stone-500">
                {(c.sent_at ?? c.created_at).substring(0, 16).replace("T", " ")}
              </td>
            </tr>
          ))}
          {!loading && campaigns.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-stone-400" colSpan={9}>
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
  const [searchMinQueryLength, setSearchMinQueryLength] = useState(
    DEFAULT_SEARCH_MIN_QUERY_LENGTH,
  );
  const schema = useMemo(
    () => createCampaignSchema(searchMinQueryLength),
    [searchMinQueryLength],
  );
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultCampaignValues,
  });

  const title = watch("title");
  const body = watch("body");
  const dest = watch("dest");
  const discoveryFilter = watch("discoveryFilter");
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

  useEffect(() => {
    supabase
      .from("app_config")
      .select("value")
      .eq("key", "search_min_query_length")
      .maybeSingle()
      .then(({ data }) => {
        const parsed = Number(data?.value);
        if (Number.isInteger(parsed) && parsed > 0) {
          setSearchMinQueryLength(parsed);
        }
      });
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
        .select("id, title, status, issuers(name, type)")
        .eq("status", "active")
        .ilike("title", `%${term}%`)
        .limit(10);
      if (!active) return;
      setBenefitResults(
        (data ?? []).map((b) => ({
          id: b.id as string,
          title: b.title as string,
          issuerName: (b.issuers as unknown as { name: string; type: string } | null)?.name ?? null,
          issuerType: (b.issuers as unknown as { name: string; type: string } | null)?.type ?? null,
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

  const changeDestination = (next: CampaignFormValues["dest"]) => {
    if (next !== "benefit") {
      setSelectedBenefit(null);
      setBenefitSearch("");
      setBenefitResults([]);
      setValue("benefit_id", "", { shouldValidate: false });
      clearErrors("benefit_id");
    }

    if (next !== "feed" && next !== "nearby") {
      setValue("discoveryFilter", "none", { shouldValidate: false });
      setValue("category_slug", "", { shouldValidate: false });
      setValue("query", "", { shouldValidate: false });
      clearErrors(["category_slug", "query"]);
    }

    setValue("dest", next, { shouldValidate: true });
  };

  const changeDiscoveryFilter = (next: CampaignFormValues["discoveryFilter"]) => {
    if (next !== "category") {
      setValue("category_slug", "", { shouldValidate: false });
      clearErrors("category_slug");
    }
    if (next !== "query") {
      setValue("query", "", { shouldValidate: false });
      clearErrors("query");
    }
    setValue("discoveryFilter", next, { shouldValidate: true });
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
      data: buildCampaignData(values),
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

    const { data: functionData, error: fnError } = await supabase.functions.invoke("send-campaign", {
      body: { campaign_id: inserted.id },
      headers: { Authorization: `Bearer ${token}` },
    });

    setSubmitting(false);
    if (fnError) {
      setErrorMsg(`Campaña creada, pero falló el envío: ${fnError.message}`);
    } else {
      const outcome = describeCampaignSendResult(
        inserted.id,
        functionData as CampaignSendResponse | null,
      );
      if (!outcome.ok) {
        setErrorMsg(`Campaña creada, pero no se completó el envío: ${outcome.message}`);
        onCreated();
        return;
      }
      setSuccessMsg(outcome.message);
      reset(defaultCampaignValues);
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
            { value: "none", label: "Sin destino" },
            { value: "benefit", label: "Beneficio" },
            { value: "feed", label: "Feed" },
            { value: "nearby", label: "Cerca" },
            { value: "profile", label: "Perfil" },
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
                  {selectedBenefit.issuerType === "platform"
                    ? "Beneficio universal de Pato: conserva la audiencia elegida abajo."
                    : `La audiencia se limitará a usuarios afiliados a ${selectedBenefit.issuerName ?? "este emisor"}.`}
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

        {(dest === "feed" || dest === "nearby") && (
          <div className="flex flex-col gap-3 rounded-md border border-stone-200 p-3">
            <p className="text-xs text-stone-500">
              {dest === "feed" ? "Abre el feed" : "Abre el mapa Cerca"}; el filtro se aplicará al entrar.
            </p>
            <div className="flex flex-col gap-2">
              {([
                { value: "none", label: "Sin filtro" },
                { value: "category", label: "Por categoría" },
                { value: "query", label: "Por búsqueda" },
              ] as const).map((opt) => (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700" key={opt.value}>
                  <input
                    checked={discoveryFilter === opt.value}
                    className="h-4 w-4"
                    onChange={() => changeDiscoveryFilter(opt.value)}
                    type="radio"
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {discoveryFilter === "category" && (
              <Field error={errors.category_slug?.message} label="Categoría">
                <select className={selectCls} {...register("category_slug")}>
                  <option value="">— seleccionar —</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </Field>
            )}

            {discoveryFilter === "query" && (
              <Field error={errors.query?.message} label="Búsqueda">
                <input
                  className={inputCls}
                  placeholder={`ej: café (mínimo ${searchMinQueryLength})`}
                  {...register("query")}
                />
              </Field>
            )}
          </div>
        )}

        {dest === "none" && (
          <p className="text-sm text-stone-500">Muestra el mensaje sin navegar al tocarlo.</p>
        )}

        {dest === "profile" && (
          <p className="text-sm text-stone-500">Abre la pestaña Perfil.</p>
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
              <ul className="flex max-h-64 flex-col divide-y divide-stone-100 overflow-y-auto rounded-md border border-stone-200">
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
  const [mode, setMode] = useState<"campaign" | "personalized">("campaign");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingDeliveries, setRefreshingDeliveries] = useState(false);
  const [deliveryRefreshMessage, setDeliveryRefreshMessage] = useState<string | null>(null);
  const reconciledOnEntry = useRef(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notification_campaigns")
      .select("id, title, status, sent_count, error_message, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = (data as CampaignRow[] | null) ?? [];
    if (rows.length === 0) {
      setCampaigns([]);
      setLoading(false);
      return;
    }

    const { data: deliveryCounts } = await supabase.rpc(
      "admin_notification_campaign_delivery_counts",
      { campaign_ids: rows.map((campaign) => campaign.id) },
    );
    const countsByCampaign = new Map(
      ((deliveryCounts ?? []) as CampaignDeliveryCounts[]).map((counts) => [
        counts.campaign_id,
        counts,
      ]),
    );
    setCampaigns(rows.map((campaign) => ({
      ...campaign,
      deliveryCounts: countsByCampaign.get(campaign.id),
    })));
    setLoading(false);
  }, []);

  const refreshDeliveries = useCallback(async () => {
    setRefreshingDeliveries(true);
    setDeliveryRefreshMessage(null);

    const token = await getFreshAccessToken();
    if (!token) {
      setDeliveryRefreshMessage("No se pudieron actualizar las entregas: sesión no disponible.");
      setRefreshingDeliveries(false);
      await loadCampaigns();
      return;
    }

    const { data, error } = await supabase.functions.invoke(
      "reconcile-push-receipts",
      {
        body: {},
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (error) {
      setDeliveryRefreshMessage(`No se pudieron consultar los receipts: ${error.message}`);
    } else {
      const summary = (data ?? {}) as ReceiptReconciliationSummary;
      const candidates = summary.candidates ?? 0;
      const ok = summary.receiptOk ?? 0;
      const failed = summary.receiptFailed ?? 0;
      const pending = summary.receiptsMissing ?? 0;
      setDeliveryRefreshMessage(
        candidates === 0
          ? "No había entregas pendientes de confirmar."
          : `Receipts consultados: ${candidates}; ${ok} confirmados, ${failed} fallidos y ${pending} aún pendientes.`,
      );
    }

    await loadCampaigns();
    setRefreshingDeliveries(false);
  }, [loadCampaigns]);

  useEffect(() => {
    if (reconciledOnEntry.current) return;
    reconciledOnEntry.current = true;
    void refreshDeliveries();
  }, [refreshDeliveries]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Notificaciones</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            Campañas con el mismo texto para todos, o personalizadas con un beneficio distinto para cada persona.
          </p>
        </div>

        <div className="flex gap-1 border-b border-stone-200">
          {([
            { value: "campaign", label: "Campaña manual" },
            { value: "personalized", label: "Personalizada" },
          ] as const).map((tab) => (
            <button
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                mode === tab.value ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
              key={tab.value}
              onClick={() => setMode(tab.value)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "personalized" ? <PersonalizedNotifications /> : null}

        {mode === "campaign" ? <CampaignForm onCreated={loadCampaigns} /> : null}

        <div className={`flex flex-col gap-3 ${mode === "campaign" ? "" : "hidden"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-900">Historial</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                Se consulta a Expo una vez al entrar. Puede tardar hasta 15 minutos en publicar receipts.
              </p>
            </div>
            <button
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              disabled={refreshingDeliveries}
              onClick={() => void refreshDeliveries()}
              type="button"
            >
              {refreshingDeliveries ? "Actualizando..." : "Actualizar entregas"}
            </button>
          </div>
          {deliveryRefreshMessage ? (
            <p className="text-xs text-stone-500">{deliveryRefreshMessage}</p>
          ) : null}
          <CampaignsList campaigns={campaigns} loading={loading} />
        </div>
      </div>
    </div>
  );
}
