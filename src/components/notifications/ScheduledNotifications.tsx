import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SCHEDULE_FORM,
  describeLimits,
  describeSchedule,
  formatChile,
  formFromSchedule,
  MAX_TARGET_USERS,
  OCCURRENCE_COLUMNS,
  type Occurrence,
  occurrenceStatusLabel,
  overlappingDays,
  SCHEDULE_COLUMNS,
  type Schedule,
  type ScheduleForm,
  scheduleFormErrors,
  scheduleRpcParams,
  scheduleStatusLabel,
  TIME_SLOTS,
  WEEKDAYS,
} from "../../lib/notificationSchedules";
import { inputCls, selectCls } from "../../lib/styles";
import { supabase } from "../../lib/supabase";

type UserOption = { id: string; label: string };

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
  held: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-red-200 bg-red-50 text-red-700",
  missed: "border-red-200 bg-red-50 text-red-700",
};

function Badge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs ${STATUS_TONE[status] ?? "border-stone-200 bg-stone-100 text-stone-600"}`}>
      {label}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-stone-700">{label}</span>
      {children}
      {hint ? <span className="text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

function rpcError(error: { message: string } | null): string | null {
  return error ? error.message : null;
}

export function ScheduledNotifications({ onOpenRequest }: { onOpenRequest: (requestId: string) => void }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [upcoming, setUpcoming] = useState<Record<string, string[]>>({});
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [form, setForm] = useState<ScheduleForm>(DEFAULT_SCHEDULE_FORM);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [rules, history, settings] = await Promise.all([
      supabase.from("notification_schedules").select(SCHEDULE_COLUMNS).neq("status", "archived").order("created_at"),
      supabase.from("notification_schedule_occurrences").select(OCCURRENCE_COLUMNS).order("scheduled_for", { ascending: false }).limit(30),
      supabase.from("notification_scheduler_settings").select("enabled").maybeSingle(),
    ]);
    const error = rules.error ?? history.error ?? settings.error;
    if (error) {
      setErrorMsg(`No se pudieron leer las programaciones: ${error.message}`);
      return;
    }
    const rows = (rules.data as unknown as Schedule[] | null) ?? [];
    setSchedules(rows);
    setOccurrences((history.data as unknown as Occurrence[] | null) ?? []);
    setEnabled(Boolean((settings.data as { enabled?: boolean } | null)?.enabled));

    const next: Record<string, string[]> = {};
    await Promise.all(
      rows.filter((row) => row.status === "active").map(async (row) => {
        const { data } = await supabase.rpc("admin_upcoming_notification_occurrences", { schedule_id: row.id, max_results: 3 });
        next[row.id] = ((data ?? []) as Array<{ scheduled_for: string }>).map((item) => item.scheduled_for);
      }),
    );
    setUpcoming(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const names = useMemo(() => new Map(schedules.map((row) => [row.id, row.name])), [schedules]);
  const overlaps = useMemo(() => overlappingDays(schedules), [schedules]);
  const formErrors = scheduleFormErrors({ ...form, target_user_ids: selectedUsers.map((u) => u.id) });

  const startEdit = (schedule: Schedule | null) => {
    setEditing(schedule);
    setForm(schedule ? formFromSchedule(schedule) : DEFAULT_SCHEDULE_FORM);
    // Al editar se conservan las cuentas por id; la búsqueda agrega nuevas.
    setSelectedUsers((schedule?.target_user_ids ?? []).map((id) => ({ id, label: id })));
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const run = async (action: () => Promise<string | null>, success: string) => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const error = await action();
    setBusy(false);
    if (error) setErrorMsg(error);
    else setSuccessMsg(success);
    await load();
  };

  const save = () => {
    if (formErrors.length > 0) return;
    const values = { ...form, target_user_ids: selectedUsers.map((u) => u.id) };
    void run(async () => {
      const { error } = await supabase.rpc("admin_save_notification_schedule", scheduleRpcParams(values, editing));
      if (!error) startEdit(null);
      return rpcError(error);
    }, editing ? "Cambios guardados como borrador; apruébala de nuevo para que vuelva a salir." : "Regla guardada como borrador.");
  };

  const approve = (schedule: Schedule) => {
    const audience = schedule.audience === "all" ? "todas las personas que pueden recibir" : `${schedule.target_user_ids?.length ?? 0} usuarios`;
    const message = [
      `¿Aprobar «${schedule.name}»?`,
      `${describeSchedule(schedule)}.`,
      `Audiencia: ${audience}. Límites: ${describeLimits(schedule)}.`,
      schedule.review_mode === "auto"
        ? "Cada ocurrencia se enviará sin revisión si pasa los límites."
        : "Cada ocurrencia esperará tu aprobación de la vista previa.",
    ].join("\n\n");
    if (!window.confirm(message)) return;
    void run(async () => {
      const { error } = await supabase.rpc("admin_approve_notification_schedule", {
        schedule_id: schedule.id,
        expected_version: schedule.version,
      });
      return rpcError(error);
    }, `«${schedule.name}» activa.`);
  };

  const setStatus = (schedule: Schedule, action: "pause" | "resume" | "archive") => {
    const verbs = { pause: "Pausar", resume: "Reanudar", archive: "Archivar" };
    const notes = {
      pause: "Lo que esté pendiente de hoy no saldrá.",
      resume: "Vuelve a salir desde su próxima hora.",
      archive: "No se puede deshacer; lo pendiente no saldrá.",
    };
    if (!window.confirm(`¿${verbs[action]} «${schedule.name}»? ${notes[action]}`)) return;
    void run(async () => {
      const { error } = await supabase.rpc("admin_set_notification_schedule_status", { schedule_id: schedule.id, action });
      return rpcError(error);
    }, `«${schedule.name}»: ${verbs[action].toLowerCase()} listo.`);
  };

  const toggleScheduler = () => {
    const next = !enabled;
    const message = next
      ? "¿Encender las notificaciones programadas? Las reglas activas y las campañas con hora empezarán a salir."
      : "¿Apagar todas las notificaciones programadas? Nada saldrá hasta encenderlas; lo que caiga mientras tanto quedará como no disparado.";
    if (!window.confirm(message)) return;
    void run(async () => {
      const { error } = await supabase.rpc("admin_set_notification_scheduler_enabled", { enabled: next });
      return rpcError(error);
    }, next ? "Programadas encendidas." : "Programadas apagadas.");
  };

  const toggleDay = (day: number) =>
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day) ? current.weekdays.filter((d) => d !== day) : [...current.weekdays, day],
    }));

  return (
    <div className="flex flex-col gap-6">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${enabled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className="text-sm text-stone-800">
          {enabled === null
            ? "Leyendo el estado…"
            : enabled
              ? "Programadas encendidas: las reglas activas y las campañas con hora salen solas."
              : "Programadas apagadas: ninguna regla ni campaña con hora sale hasta encenderlas."}
        </p>
        <button
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          disabled={busy || enabled === null}
          onClick={toggleScheduler}
          type="button"
        >
          {enabled ? "Apagar todo" : "Encender"}
        </button>
      </div>

      {errorMsg ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p> : null}
      {successMsg ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{successMsg}</p> : null}

      <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-6">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{editing ? `Editar «${editing.name}»` : "Nueva regla personalizada"}</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Cada ocurrencia elige un beneficio por persona, como la personalizada. Se guarda como borrador y sólo sale después de aprobarla.
            {editing ? " Editar una regla activa la devuelve a borrador." : ""}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nombre">
            <input className={inputCls} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Almuerzo de semana" value={form.name} />
          </Field>
          <Field hint="Hora de Chile, entre 09:00 y 21:00." label="Hora">
            <select className={selectCls} onChange={(e) => setForm({ ...form, local_time: e.target.value })} value={form.local_time}>
              {TIME_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">Días</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 ${form.weekdays.includes(day.value) ? "border-stone-900 bg-stone-100 font-medium" : "border-stone-200 text-stone-600"}`}
                key={day.value}
              >
                <input checked={form.weekdays.includes(day.value)} className="h-4 w-4" onChange={() => toggleDay(day.value)} type="checkbox" />
                {day.short}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-stone-700">Audiencia</span>
          <div className="flex gap-2">
            {([
              { value: "all", label: "Todos los que pueden recibir" },
              { value: "users", label: "Usuarios específicos" },
            ] as const).map((opt) => (
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${form.audience === opt.value ? "border-stone-900 bg-stone-100 font-medium" : "border-stone-200 text-stone-600"}`}
                key={opt.value}
              >
                <input checked={form.audience === opt.value} className="h-4 w-4" onChange={() => setForm({ ...form, audience: opt.value })} type="radio" />
                {opt.label}
              </label>
            ))}
          </div>
          {form.audience === "users" ? (
            <div className="flex flex-col gap-2 rounded-md border border-stone-200 p-3">
              {selectedUsers.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {selectedUsers.map((u) => (
                    <li className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs text-stone-700" key={u.id}>
                      {u.label}
                      <button className="text-stone-400 hover:text-stone-700" onClick={() => setSelectedUsers((list) => list.filter((x) => x.id !== u.id))} type="button">×</button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                className={inputCls}
                disabled={selectedUsers.length >= MAX_TARGET_USERS}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por nombre o correo..."
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
          ) : null}
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-stone-700">Revisión</span>
          <div className="flex flex-col gap-2 md:flex-row">
            {([
              { value: "review_before", label: "Revisar antes de cada envío", hint: "Calcula la vista previa antes de la hora y sólo sale si alguien la aprueba. Recomendado al empezar." },
              { value: "auto", label: "Enviar sola si pasa los límites", hint: "Nadie lee el texto antes; si el plan sale de los límites, se retiene para revisarlo." },
            ] as const).map((opt) => (
              <label
                className={`flex flex-1 cursor-pointer gap-2 rounded-md border px-3 py-2 ${form.review_mode === opt.value ? "border-stone-900 bg-stone-100" : "border-stone-200"}`}
                key={opt.value}
              >
                <input checked={form.review_mode === opt.value} className="mt-0.5 h-4 w-4" onChange={() => setForm({ ...form, review_mode: opt.value })} type="radio" />
                <span>
                  <span className="font-medium text-stone-800">{opt.label}</span>
                  <span className="block text-xs text-stone-500">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Field hint="Si el plan supera este número, no sale solo." label="Máx. destinatarios">
            <input className={inputCls} inputMode="numeric" onChange={(e) => setForm({ ...form, max_recipients: e.target.value })} placeholder="5000" value={form.max_recipients} />
          </Field>
          <Field hint="Con menos, no sale sola." label="Mín. destinatarios">
            <input className={inputCls} inputMode="numeric" onChange={(e) => setForm({ ...form, min_selected: e.target.value })} value={form.min_selected} />
          </Field>
          <Field hint="Desde 20 personas: más con el mismo beneficio es un envío masivo." label="Máx. % mismo beneficio">
            <input className={inputCls} inputMode="numeric" onChange={(e) => setForm({ ...form, max_same_benefit_percent: e.target.value })} value={form.max_same_benefit_percent} />
          </Field>
          <Field hint="Si son más viejas, se piden de nuevo antes de la hora." label="Señales (días)">
            <input className={inputCls} inputMode="numeric" onChange={(e) => setForm({ ...form, max_signal_age_days: e.target.value })} value={form.max_signal_age_days} />
          </Field>
          {form.review_mode === "review_before" ? (
            <Field hint="Entre 15 y 120." label="Vista previa (min antes)">
              <input className={inputCls} inputMode="numeric" onChange={(e) => setForm({ ...form, review_lead_minutes: e.target.value })} value={form.review_lead_minutes} />
            </Field>
          ) : null}
        </div>

        {formErrors.length > 0 && (form.name || form.weekdays.length > 0) ? (
          <ul className="list-disc pl-5 text-xs text-red-700">{formErrors.map((error) => <li key={error}>{error}</li>)}</ul>
        ) : null}

        <div className="flex gap-2">
          <button
            className="rounded-md bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
            disabled={busy || formErrors.length > 0}
            onClick={save}
            type="button"
          >
            Guardar como borrador
          </button>
          {editing ? (
            <button className="rounded-md border border-stone-300 px-4 py-2 text-sm text-stone-700" onClick={() => startEdit(null)} type="button">Cancelar</button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-stone-900">Reglas</h2>
        {overlaps.length > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {overlaps.map(({ day, names: rules }) => `${WEEKDAYS.find((d) => d.value === day)?.long}: ${rules.join(", ")}`).join(" · ")}.
            Dos reglas el mismo día compiten por el límite de una notificación por persona al día: la segunda llegará a pocas personas.
          </p>
        ) : null}
        {schedules.length === 0 ? <p className="text-sm text-stone-400">Sin reglas todavía.</p> : null}
        {schedules.map((schedule) => (
          <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-4" key={schedule.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-900">{schedule.name}</span>
                <Badge label={scheduleStatusLabel(schedule.status)} status={schedule.status} />
                <span className="text-xs text-stone-400">versión {schedule.version}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {schedule.status === "draft" ? (
                  <button className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => approve(schedule)} type="button">Aprobar</button>
                ) : null}
                {schedule.status === "active" ? (
                  <button className="rounded-md border border-stone-300 px-3 py-1.5 text-xs" disabled={busy} onClick={() => setStatus(schedule, "pause")} type="button">Pausar</button>
                ) : null}
                {schedule.status === "paused" ? (
                  <button className="rounded-md border border-stone-300 px-3 py-1.5 text-xs" disabled={busy} onClick={() => setStatus(schedule, "resume")} type="button">Reanudar</button>
                ) : null}
                <button className="rounded-md border border-stone-300 px-3 py-1.5 text-xs" disabled={busy} onClick={() => startEdit(schedule)} type="button">Editar</button>
                <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700" disabled={busy} onClick={() => setStatus(schedule, "archive")} type="button">Archivar</button>
              </div>
            </div>
            <p className="text-sm text-stone-700">{describeSchedule(schedule)}.</p>
            <p className="text-xs text-stone-500">
              {schedule.audience === "all" ? "Todos los que pueden recibir" : `${schedule.target_user_ids?.length ?? 0} usuarios`} · {describeLimits(schedule)}
            </p>
            {upcoming[schedule.id]?.length ? (
              <p className="text-xs text-stone-500">Próximas: {upcoming[schedule.id].map((value) => formatChile(value)).join(" · ")}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-stone-900">Ocurrencias recientes</h2>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Hora (Chile)</th>
                <th className="px-4 py-3">Qué</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {occurrences.map((occurrence) => (
                <tr key={occurrence.id}>
                  <td className="px-4 py-3 text-stone-600">{formatChile(occurrence.scheduled_for)}</td>
                  <td className="px-4 py-3">
                    {occurrence.campaign_id ? "Campaña manual" : names.get(occurrence.schedule_id ?? "") ?? "Regla archivada"}
                  </td>
                  <td className="px-4 py-3"><Badge label={occurrenceStatusLabel(occurrence.status)} status={occurrence.status} /></td>
                  <td className="px-4 py-3 text-xs text-stone-600">
                    {occurrence.reason ?? (occurrence.status === "sent" && occurrence.result
                      ? `${Number(occurrence.result.expo_accepted ?? 0).toLocaleString("es-CL")} aceptadas por Expo`
                      : "—")}
                    {occurrence.plan_request_id && ["held", "planning", "sent", "failed"].includes(occurrence.status) ? (
                      <button className="ml-2 text-sky-700 underline" onClick={() => onOpenRequest(occurrence.plan_request_id!)} type="button">
                        {occurrence.status === "held" || occurrence.status === "planning" ? "Revisar vista previa" : "Ver solicitud"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {occurrences.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-stone-400" colSpan={4}>Todavía no hay ocurrencias.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
