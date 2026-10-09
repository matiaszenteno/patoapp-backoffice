import { useCallback, useEffect, useMemo, useState } from "react";
import { getFreshAccessToken } from "../../lib/auth";
import {
  describeDelivery,
  isInProgress,
  locationLabel,
  MAX_TARGET_USERS,
  nearbyCount,
  type PlanRequest,
  POLL_INTERVAL_MS,
  reasonLabel,
  requestStatusLabel,
  sendBlocker,
  skippedCount,
} from "../../lib/personalizedNotifications";
import { inputCls } from "../../lib/styles";
import { supabase } from "../../lib/supabase";

type ProfileOption = { id: string; label: string };

// El historial no trae `preview`: con "Todos" pesa cerca de 1 MB por solicitud.
const LIST_COLUMNS =
  "id, audience, target_user_ids, status, plan_hash, as_of, summary, delivery, error, created_at, sent_at";
const DETAIL_COLUMNS = `${LIST_COLUMNS}, preview`;
const PREVIEW_PAGE = 100;

async function invokePersonalized(body: Record<string, unknown>): Promise<{ request_id?: string; error?: string }> {
  const token = await getFreshAccessToken();
  if (!token) return { error: "Sesión no disponible; vuelve a ingresar." };
  const { data, error } = await supabase.functions.invoke("personalized-notifications", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    // La Edge Function responde el motivo en el body incluso con 4xx.
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    return { error: (detail as { error?: string } | null)?.error ?? error.message };
  }
  return data as { request_id?: string };
}

function Stat({ label, value, tone = "stone" }: { label: string; value: number; tone?: "stone" | "emerald" | "amber" }) {
  const toneCls = {
    stone: "border-stone-200 bg-white text-stone-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return (
    <div className={`rounded-md border px-3 py-2 ${toneCls}`}>
      <p className="text-lg font-semibold">{value.toLocaleString("es-CL")}</p>
      <p className="text-xs opacity-80">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: PlanRequest["status"] }) {
  const cls = status === "sent"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : status === "ready"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-stone-200 bg-stone-100 text-stone-600";
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs ${cls}`}>{requestStatusLabel(status)}</span>;
}

function PreviewTable({ request, categories }: { request: PlanRequest; categories: Map<string, string> }) {
  const [showSkipped, setShowSkipped] = useState(false);
  const [visible, setVisible] = useState(PREVIEW_PAGE);
  const rows = useMemo(
    () => (request.preview ?? []).filter((row) => showSkipped || row.action === "selected"),
    [request.preview, showSkipped],
  );
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs text-stone-600">
        <input checked={showSkipped} className="h-4 w-4" onChange={(e) => setShowSkipped(e.target.checked)} type="checkbox" />
        Mostrar también a quienes no recibirán
      </label>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Persona</th>
              <th className="px-3 py-2">Notificación</th>
              <th className="px-3 py-2">Beneficio</th>
              <th className="px-3 py-2">Por qué</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.slice(0, visible).map((row) => (
              <tr key={row.user_id} className={row.action === "selected" ? "" : "bg-stone-50 text-stone-500"}>
                <td className="px-3 py-2 align-top">
                  <p className="font-medium text-stone-900">{row.name ?? "Sin nombre"}</p>
                  <p className="font-mono text-[11px] text-stone-400">{row.user_id.slice(0, 8)}</p>
                </td>
                <td className="min-w-64 px-3 py-2 align-top">
                  {row.action === "selected" ? (
                    <>
                      <p className="font-semibold text-stone-900">{row.title}</p>
                      <p className="text-stone-600">{row.body}</p>
                    </>
                  ) : (
                    <p className="italic">No recibirá: {reasonLabel(row.reason)}</p>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-stone-600">
                  {row.merchant ?? "—"}
                  {row.issuer ? <p className="text-xs text-stone-400">{row.issuer}</p> : null}
                </td>
                <td className="px-3 py-2 align-top text-xs text-stone-600">
                  {row.action === "selected" ? (
                    <>
                      <p>
                        {row.category_score != null
                          ? `${categories.get(row.category_id ?? "") ?? "Categoría"} · interés ${row.category_score.toFixed(2)}`
                          : reasonLabel(row.reason)}
                      </p>
                      <p>{locationLabel(row.location_match)}</p>
                      {row.requires_affiliation ? <p className="text-amber-700">Condicional: no tiene esa tarjeta</p> : null}
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-stone-400" colSpan={4}>Nadie en esta vista</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > visible ? (
        <button
          className="self-start text-xs font-medium text-stone-600 hover:text-stone-900"
          onClick={() => setVisible((value) => value + PREVIEW_PAGE)}
          type="button"
        >
          Mostrar {Math.min(PREVIEW_PAGE, rows.length - visible)} más de {rows.length - visible}
        </button>
      ) : null}
    </div>
  );
}

export function PersonalizedNotifications() {
  const [audience, setAudience] = useState<"users" | "all">("users");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<ProfileOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<ProfileOption[]>([]);
  const [requests, setRequests] = useState<PlanRequest[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<PlanRequest | null>(null);
  const [categories, setCategories] = useState<Map<string, string>>(new Map());
  const [typedRecipients, setTypedRecipients] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("notification_plan_requests")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      setErrorMsg(`No se pudo leer el historial: ${error.message}`);
      return;
    }
    setRequests((data as PlanRequest[] | null) ?? []);
  }, []);

  const loadActive = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("notification_plan_requests")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      setErrorMsg(`No se pudo leer la solicitud: ${error.message}`);
      return;
    }
    setActive((data as PlanRequest | null) ?? null);
  }, []);

  useEffect(() => {
    if (activeId) void loadActive(activeId);
    else setActive(null);
  }, [activeId, loadActive]);

  useEffect(() => {
    void loadRequests();
    supabase
      .from("categories")
      .select("id, name")
      .then(({ data }) => setCategories(new Map(((data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]))));
  }, [loadRequests]);

  // Mientras el workflow trabaja, se vuelve a leer la fila hasta un estado final.
  useEffect(() => {
    if (!active || !isInProgress(active.status)) return;
    const handle = setTimeout(() => {
      void loadActive(active.id);
      void loadRequests();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(handle);
  }, [active, loadActive, loadRequests]);

  // Mismo RPC que la campaña manual: nombre o correo, sin exponer profiles al browser.
  useEffect(() => {
    const term = userSearch.trim();
    if (term.length < 2) {
      setUserResults([]);
      return;
    }
    let alive = true;
    const handle = setTimeout(async () => {
      const { data } = await supabase.rpc("admin_search_profiles", { search: term, max_results: 10 });
      if (!alive) return;
      const already = new Set(selectedUsers.map((u) => u.id));
      setUserResults(
        ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
          .filter((p) => !already.has(p.id))
          .map((p) => ({ id: p.id, label: `${p.full_name ?? "Sin nombre"} — ${p.email ?? "sin correo"}` })),
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [userSearch, selectedUsers]);

  const requestPreview = async () => {
    setErrorMsg(null);
    if (audience === "users" && selectedUsers.length === 0) {
      setErrorMsg("Elige al menos un usuario.");
      return;
    }
    setBusy(true);
    const result = await invokePersonalized({
      action: "plan",
      audience,
      target_user_ids: audience === "users" ? selectedUsers.map((u) => u.id) : undefined,
    });
    setBusy(false);
    if (result.error || !result.request_id) {
      setErrorMsg(`No se pudo pedir la vista previa: ${result.error ?? "sin respuesta"}`);
      return;
    }
    setTypedRecipients("");
    setActiveId(result.request_id);
    await loadRequests();
  };

  const send = async () => {
    if (!active) return;
    setErrorMsg(null);
    setBusy(true);
    const result = await invokePersonalized({
      action: "send",
      request_id: active.id,
      plan_hash: active.plan_hash,
      confirm_recipients: Number(typedRecipients),
    });
    setBusy(false);
    if (result.error) setErrorMsg(`No se envió: ${result.error}`);
    await Promise.all([loadActive(active.id), loadRequests()]);
  };

  const blocker = active ? sendBlocker(active, typedRecipients, new Date()) : null;
  const selected = active?.summary?.selected ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-6">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Nueva notificación personalizada</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Cada persona recibe un beneficio de sus tarjetas según su interés por categoría y sus comunas. Primero verás qué
            recibiría cada una; nada se envía hasta que lo confirmes.
          </p>
        </div>

        <div className="flex gap-2">
          {([
            { value: "users", label: "Usuarios específicos" },
            { value: "all", label: "Todos los que pueden recibir" },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                audience === opt.value ? "border-stone-900 bg-stone-100 font-medium text-stone-900" : "border-stone-200 text-stone-600 hover:border-stone-400"
              }`}
            >
              <input checked={audience === opt.value} className="h-4 w-4" onChange={() => setAudience(opt.value)} type="radio" />
              {opt.label}
            </label>
          ))}
        </div>

        {audience === "users" ? (
          <div className="flex flex-col gap-2 rounded-md border border-stone-200 p-3">
            {selectedUsers.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {selectedUsers.map((u) => (
                  <li className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs text-stone-700" key={u.id}>
                    {u.label}
                    <button
                      className="text-stone-400 hover:text-stone-700"
                      onClick={() => setSelectedUsers((list) => list.filter((x) => x.id !== u.id))}
                      type="button"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              className={inputCls}
              disabled={selectedUsers.length >= MAX_TARGET_USERS}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder={selectedUsers.length >= MAX_TARGET_USERS ? `Máximo ${MAX_TARGET_USERS} usuarios` : "Buscar por nombre o correo..."}
              type="search"
              value={userSearch}
            />
            {userResults.length > 0 && (
              <ul className="flex max-h-64 flex-col divide-y divide-stone-100 overflow-y-auto rounded-md border border-stone-200">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
                      onClick={() => {
                        setSelectedUsers((list) => [...list, u]);
                        setUserSearch("");
                        setUserResults([]);
                      }}
                      type="button"
                    >
                      {u.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Incluye a todas las personas con notificaciones activadas. La vista previa puede tardar 1 a 2 minutos.
          </p>
        )}

        <div>
          <button
            className="rounded-md bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
            disabled={busy || (active !== null && isInProgress(active.status))}
            onClick={() => void requestPreview()}
            type="button"
          >
            Generar vista previa
          </button>
        </div>
        {errorMsg ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p> : null}
      </div>

      {active ? (
        <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-stone-900">
              {active.audience === "all" ? "Todos los que pueden recibir" : `${active.target_user_ids?.length ?? 0} usuarios elegidos`}
            </h2>
            <StatusBadge status={active.status} />
          </div>

          {isInProgress(active.status) ? (
            <p className="text-sm text-stone-500">
              {active.status === "sending" || active.status === "approved"
                ? "Enviando. No cierres el resultado: se actualiza solo."
                : "Calculando qué recibiría cada persona…"}
            </p>
          ) : null}
          {active.status === "failed" ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{active.error ?? "Falló sin motivo registrado."}</p>
          ) : null}
          {active.status === "sent" ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Enviada. {describeDelivery(active.delivery)} La confirmación de entrega se ve en "Actualizar entregas" del historial de campañas a los 15 minutos.
            </p>
          ) : null}

          {active.summary ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Stat label="Recibirán" tone="emerald" value={selected} />
              <Stat label="No recibirán" tone="amber" value={skippedCount(active.summary)} />
              <Stat label="Elegidos por interés" value={active.summary.selected_by_affinity ?? 0} />
              <Stat label="Beneficio cerca" value={nearbyCount(active.summary)} />
              <Stat label="Sin comunas" value={active.summary.profiles_without_communes ?? 0} />
            </div>
          ) : null}

          {active.preview ? <PreviewTable categories={categories} key={active.id} request={active} /> : null}

          {active.status === "ready" ? (
            <div className="flex flex-col gap-2 rounded-md border border-stone-300 bg-stone-50 p-4">
              <p className="text-sm text-stone-700">
                Para enviar, escribe la cantidad de destinatarios: <strong>{selected.toLocaleString("es-CL")}</strong>. Se vuelve a calcular el plan
                y sólo se envía si es idéntico a esta vista previa.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${inputCls} w-32`}
                  inputMode="numeric"
                  onChange={(e) => setTypedRecipients(e.target.value)}
                  placeholder={String(selected)}
                  value={typedRecipients}
                />
                <button
                  className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  disabled={busy || blocker !== null}
                  onClick={() => void send()}
                  type="button"
                >
                  Enviar {selected.toLocaleString("es-CL")} notificaciones
                </button>
              </div>
              {blocker && typedRecipients ? <p className="text-xs text-stone-500">{blocker}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-stone-900">Solicitudes recientes</h2>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Audiencia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Destinatarios</th>
                <th className="px-4 py-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {requests.map((request) => (
                <tr
                  className={`cursor-pointer hover:bg-stone-50 ${request.id === activeId ? "bg-stone-50" : ""}`}
                  key={request.id}
                  onClick={() => {
                    setActiveId(request.id);
                    setTypedRecipients("");
                  }}
                >
                  <td className="px-4 py-3 text-stone-500">{request.created_at.substring(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-3">{request.audience === "all" ? "Todos" : `${request.target_user_ids?.length ?? 0} usuarios`}</td>
                  <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                  <td className="px-4 py-3 text-stone-600">{request.summary?.selected ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-stone-600">
                    {request.status === "sent" ? describeDelivery(request.delivery) : request.status === "failed" ? request.error : "—"}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-stone-400" colSpan={5}>Sin solicitudes todavía</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
