// Notificaciones programadas (decisión 0029 de patoapp).
//
// Las reglas viven en `notification_schedules` y cada vez que una debía salir queda en
// `notification_schedule_occurrences` (patoapp-scrapers). El backoffice las lee por
// RLS y las escribe sólo por RPC; el disparador de pg_cron hace el resto. El contrato
// está en patoapp-scrapers/docs/notification-personalization.md#programadas.

export type ScheduleStatus = "draft" | "active" | "paused" | "archived";
export type ReviewMode = "auto" | "review_before";
export type OccurrenceStatus =
  | "scheduled"
  | "planning"
  | "dispatched"
  | "sent"
  | "held"
  | "skipped"
  | "missed"
  | "failed";

export type Schedule = {
  id: string;
  name: string;
  status: ScheduleStatus;
  version: number;
  weekdays: number[];
  local_time: string;
  starts_on: string | null;
  ends_on: string | null;
  audience: "users" | "all";
  target_user_ids: string[] | null;
  max_recipients: number;
  min_selected: number;
  max_same_benefit_ratio: number;
  max_signal_age_days: number;
  review_mode: ReviewMode;
  review_lead_minutes: number;
  approved_at: string | null;
  approved_version: number | null;
  created_at: string;
};

export type Occurrence = {
  id: string;
  schedule_id: string | null;
  campaign_id: string | null;
  scheduled_for: string;
  mode: "auto" | "review_before" | "campaign";
  status: OccurrenceStatus;
  plan_request_id: string | null;
  reason: string | null;
  result: Record<string, unknown> | null;
};

export type ScheduleForm = {
  name: string;
  weekdays: number[];
  local_time: string;
  audience: "users" | "all";
  target_user_ids: string[];
  max_recipients: string;
  min_selected: string;
  max_same_benefit_percent: string;
  max_signal_age_days: string;
  review_mode: ReviewMode;
  review_lead_minutes: string;
};

export const SCHEDULE_COLUMNS =
  "id, name, status, version, weekdays, local_time, starts_on, ends_on, audience, target_user_ids, " +
  "max_recipients, min_selected, max_same_benefit_ratio, max_signal_age_days, review_mode, " +
  "review_lead_minutes, approved_at, approved_version, created_at";
export const OCCURRENCE_COLUMNS =
  "id, schedule_id, campaign_id, scheduled_for, mode, status, plan_request_id, reason, result";

export const MAX_TARGET_USERS = 100;
export const CHILE_TZ = "America/Santiago";

/** ISO: 1 = lunes. */
export const WEEKDAYS: ReadonlyArray<{ value: number; short: string; long: string }> = [
  { value: 1, short: "Lun", long: "lunes" },
  { value: 2, short: "Mar", long: "martes" },
  { value: 3, short: "Mié", long: "miércoles" },
  { value: 4, short: "Jue", long: "jueves" },
  { value: 5, short: "Vie", long: "viernes" },
  { value: 6, short: "Sáb", long: "sábado" },
  { value: 7, short: "Dom", long: "domingo" },
];

/** Horas que acepta la regla: 09:00 a 21:00 de Chile, cada 5 minutos. */
export const TIME_SLOTS: readonly string[] = Array.from({ length: (21 - 9) * 12 + 1 }, (_, index) => {
  const minutes = 9 * 60 + index * 5;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export const DEFAULT_SCHEDULE_FORM: ScheduleForm = {
  name: "",
  weekdays: [],
  local_time: "12:30",
  audience: "all",
  target_user_ids: [],
  max_recipients: "",
  min_selected: "1",
  max_same_benefit_percent: "50",
  max_signal_age_days: "7",
  review_mode: "review_before",
  review_lead_minutes: "60",
};

export function formFromSchedule(schedule: Schedule): ScheduleForm {
  return {
    name: schedule.name,
    weekdays: [...schedule.weekdays],
    local_time: schedule.local_time.slice(0, 5),
    audience: schedule.audience,
    target_user_ids: schedule.target_user_ids ?? [],
    max_recipients: String(schedule.max_recipients),
    min_selected: String(schedule.min_selected),
    max_same_benefit_percent: String(Math.round(Number(schedule.max_same_benefit_ratio) * 100)),
    max_signal_age_days: String(schedule.max_signal_age_days),
    review_mode: schedule.review_mode,
    review_lead_minutes: String(schedule.review_lead_minutes),
  };
}

function integer(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

/** Errores del formulario en el mismo orden que la UI; vacío si se puede guardar. */
export function scheduleFormErrors(form: ScheduleForm): string[] {
  const errors: string[] = [];
  const name = form.name.trim();
  if (name.length < 1 || name.length > 80) errors.push("El nombre debe tener entre 1 y 80 caracteres.");
  if (form.weekdays.length === 0) errors.push("Elige al menos un día.");
  if (!TIME_SLOTS.includes(form.local_time)) errors.push("La hora debe estar entre 09:00 y 21:00, cada 5 minutos.");
  if (form.audience === "users") {
    if (form.target_user_ids.length === 0) errors.push("Elige al menos un usuario.");
    if (form.target_user_ids.length > MAX_TARGET_USERS) {
      errors.push(`Máximo ${MAX_TARGET_USERS} usuarios; usa "Todos" para más.`);
    }
  }
  const max = integer(form.max_recipients);
  const min = integer(form.min_selected);
  if (max === null || max < 1 || max > 100000) errors.push("El máximo de destinatarios debe estar entre 1 y 100.000.");
  if (min === null || min < 1 || (max !== null && min > max)) {
    errors.push("El mínimo de destinatarios debe ser al menos 1 y no superar el máximo.");
  }
  const percent = integer(form.max_same_benefit_percent);
  if (percent === null || percent < 1 || percent > 100) {
    errors.push("El máximo con el mismo beneficio debe estar entre 1% y 100%.");
  }
  const age = integer(form.max_signal_age_days);
  if (age === null || age < 1 || age > 90) errors.push("La antigüedad de las señales debe estar entre 1 y 90 días.");
  if (form.review_mode === "review_before") {
    const lead = integer(form.review_lead_minutes);
    if (lead === null || lead < 15 || lead > 120) {
      errors.push("La vista previa debe calcularse entre 15 y 120 minutos antes.");
    }
  }
  return errors;
}

/** Parámetros de admin_save_notification_schedule. Sólo con un formulario válido. */
export function scheduleRpcParams(form: ScheduleForm, existing: Pick<Schedule, "id" | "version"> | null) {
  return {
    name: form.name.trim(),
    weekdays: [...new Set(form.weekdays)].sort((a, b) => a - b),
    local_time: form.local_time,
    audience: form.audience,
    target_user_ids: form.audience === "users" ? form.target_user_ids : null,
    max_recipients: Number(form.max_recipients),
    min_selected: Number(form.min_selected),
    max_same_benefit_ratio: Number(form.max_same_benefit_percent) / 100,
    max_signal_age_days: Number(form.max_signal_age_days),
    review_mode: form.review_mode,
    review_lead_minutes: form.review_mode === "review_before" ? Number(form.review_lead_minutes) : 60,
    schedule_id: existing?.id ?? null,
    expected_version: existing?.version ?? null,
  };
}

export function describeWeekdays(weekdays: readonly number[]): string {
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Todos los días";
  if (sorted.join(",") === "1,2,3,4,5") return "De lunes a viernes";
  if (sorted.join(",") === "6,7") return "Fines de semana";
  const names = sorted.map((day) => WEEKDAYS.find((item) => item.value === day)?.long ?? String(day));
  if (names.length === 1) return `Los ${names[0]}`;
  return `Los ${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function describeSchedule(schedule: Pick<Schedule, "weekdays" | "local_time" | "review_mode" | "review_lead_minutes">): string {
  const base = `${describeWeekdays(schedule.weekdays)} a las ${schedule.local_time.slice(0, 5)}`;
  return schedule.review_mode === "review_before"
    ? `${base}; vista previa ${schedule.review_lead_minutes} min antes, sale sólo si alguien la aprueba`
    : `${base}; sale sola si pasa los límites`;
}

export function describeLimits(schedule: Pick<
  Schedule,
  "max_recipients" | "min_selected" | "max_same_benefit_ratio" | "max_signal_age_days"
>): string {
  const percent = Math.round(Number(schedule.max_same_benefit_ratio) * 100);
  return [
    `entre ${schedule.min_selected.toLocaleString("es-CL")} y ${schedule.max_recipients.toLocaleString("es-CL")} destinatarios`,
    `a lo sumo ${percent}% con el mismo beneficio`,
    `señales de hasta ${schedule.max_signal_age_days} días`,
  ].join(" · ");
}

export function scheduleStatusLabel(status: ScheduleStatus): string {
  switch (status) {
    case "draft": return "Borrador";
    case "active": return "Activa";
    case "paused": return "Pausada";
    case "archived": return "Archivada";
  }
}

export function occurrenceStatusLabel(status: OccurrenceStatus): string {
  switch (status) {
    case "scheduled": return "Programada";
    case "planning": return "Vista previa en revisión";
    case "dispatched": return "En curso";
    case "sent": return "Enviada";
    case "held": return "Retenida: revisar y enviar a mano";
    case "skipped": return "Omitida";
    case "missed": return "No se disparó a tiempo";
    case "failed": return "Falló";
  }
}

/** Días que comparten dos reglas activas: la segunda llegará a pocas personas por el cooldown. */
export function overlappingDays(
  schedules: ReadonlyArray<Pick<Schedule, "id" | "name" | "status" | "weekdays">>,
): Array<{ day: number; names: string[] }> {
  const byDay = new Map<number, string[]>();
  for (const schedule of schedules) {
    if (schedule.status !== "active") continue;
    for (const day of new Set(schedule.weekdays)) byDay.set(day, [...(byDay.get(day) ?? []), schedule.name]);
  }
  return [...byDay.entries()]
    .filter(([, names]) => names.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([day, names]) => ({ day, names }));
}

/** Fecha y hora en Chile, para mostrar. */
export function formatChile(value: string | Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function chileParts(value: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CHILE_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Instante de una fecha y hora de pared en Chile ("2026-11-05", "19:00"), o null si
 * esa hora no existe ese día (el salto del cambio de horario). */
export function chileWallTimeToDate(day: string, time: string): Date | null {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dayMatch || !timeMatch) return null;
  const [year, month, date] = dayMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  // Chile está entre UTC-3 y UTC-4: se prueba cada desfase y se queda el que
  // reproduce la misma hora de pared.
  for (const offsetHours of [3, 4]) {
    const candidate = new Date(wall + offsetHours * 3_600_000);
    const parts = chileParts(candidate);
    if (
      parts.year === year && parts.month === month && parts.day === date &&
      parts.hour === hour && parts.minute === minute
    ) {
      return candidate;
    }
  }
  return null;
}

/** Mismas reglas que admin_schedule_notification_campaign, para avisar antes. */
export function campaignScheduleError(scheduledAt: Date | null, now: Date): string | null {
  if (!scheduledAt) return "Esa hora no existe en Chile ese día.";
  if (scheduledAt.getTime() < now.getTime() + 5 * 60_000) {
    return "La hora programada debe ser al menos 5 minutos en el futuro.";
  }
  if (scheduledAt.getTime() > now.getTime() + 60 * 24 * 3_600_000) {
    return "La hora programada no puede estar a más de 60 días.";
  }
  const { hour, minute } = chileParts(scheduledAt);
  const minutes = hour * 60 + minute;
  if (minutes < 9 * 60 || minutes > 21 * 60) return "La hora programada debe estar entre las 09:00 y las 21:00 de Chile.";
  return null;
}
