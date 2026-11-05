import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignScheduleError,
  chileWallTimeToDate,
  DEFAULT_SCHEDULE_FORM,
  describeLimits,
  describeSchedule,
  describeWeekdays,
  formFromSchedule,
  overlappingDays,
  type Schedule,
  scheduleFormErrors,
  scheduleRpcParams,
  TIME_SLOTS,
} from "../src/lib/notificationSchedules.ts";

const VALID = { ...DEFAULT_SCHEDULE_FORM, name: "Almuerzo", weekdays: [3, 1], max_recipients: "5000" };

const SCHEDULE: Schedule = {
  id: "s-1",
  name: "Almuerzo",
  status: "active",
  version: 2,
  weekdays: [1, 3, 5],
  local_time: "12:30:00",
  starts_on: null,
  ends_on: null,
  audience: "all",
  target_user_ids: null,
  max_recipients: 5000,
  min_selected: 10,
  max_same_benefit_ratio: 0.5,
  max_signal_age_days: 7,
  review_mode: "auto",
  review_lead_minutes: 60,
  approved_at: "2026-11-05T12:00:00Z",
  approved_version: 2,
  created_at: "2026-11-05T12:00:00Z",
};

test("las horas permitidas van de 09:00 a 21:00 cada 5 minutos", () => {
  assert.equal(TIME_SLOTS[0], "09:00");
  assert.equal(TIME_SLOTS.at(-1), "21:00");
  assert.equal(TIME_SLOTS.length, 145);
  assert.ok(!TIME_SLOTS.includes("12:07"));
});

test("un formulario válido no tiene errores y arma los parámetros de la RPC", () => {
  assert.deepEqual(scheduleFormErrors(VALID), []);
  assert.deepEqual(scheduleRpcParams(VALID, null), {
    name: "Almuerzo",
    weekdays: [1, 3],
    local_time: "12:30",
    audience: "all",
    target_user_ids: null,
    max_recipients: 5000,
    min_selected: 1,
    max_same_benefit_ratio: 0.5,
    max_signal_age_days: 7,
    review_mode: "review_before",
    review_lead_minutes: 60,
    schedule_id: null,
    expected_version: null,
  });
});

test("editar manda el id y la versión que se revisó", () => {
  const params = scheduleRpcParams(formFromSchedule(SCHEDULE), SCHEDULE);
  assert.equal(params.schedule_id, "s-1");
  assert.equal(params.expected_version, 2);
  assert.equal(params.local_time, "12:30");
  assert.equal(params.max_same_benefit_ratio, 0.5);
  assert.equal(params.review_mode, "auto");
});

test("el formulario explica cada error en español", () => {
  const errors = scheduleFormErrors({
    ...DEFAULT_SCHEDULE_FORM,
    audience: "users",
    local_time: "08:00",
    max_recipients: "10",
    min_selected: "20",
    review_lead_minutes: "5",
  });
  assert.deepEqual(errors, [
    "El nombre debe tener entre 1 y 80 caracteres.",
    "Elige al menos un día.",
    "La hora debe estar entre 09:00 y 21:00, cada 5 minutos.",
    "Elige al menos un usuario.",
    "El mínimo de destinatarios debe ser al menos 1 y no superar el máximo.",
    "La vista previa debe calcularse entre 15 y 120 minutos antes.",
  ]);
});

test("los días se describen como los diría una persona", () => {
  assert.equal(describeWeekdays([1, 2, 3, 4, 5]), "De lunes a viernes");
  assert.equal(describeWeekdays([7, 6]), "Fines de semana");
  assert.equal(describeWeekdays([1, 3, 5]), "Los lunes, miércoles y viernes");
  assert.equal(describeWeekdays([4]), "Los jueves");
  assert.equal(describeWeekdays([1, 2, 3, 4, 5, 6, 7]), "Todos los días");
});

test("la regla y sus límites se resumen en una línea", () => {
  assert.equal(describeSchedule(SCHEDULE), "Los lunes, miércoles y viernes a las 12:30; sale sola si pasa los límites");
  assert.equal(
    describeSchedule({ ...SCHEDULE, review_mode: "review_before", review_lead_minutes: 45 }),
    "Los lunes, miércoles y viernes a las 12:30; vista previa 45 min antes, sale sólo si alguien la aprueba",
  );
  assert.equal(
    describeLimits(SCHEDULE),
    "entre 10 y 5.000 destinatarios · a lo sumo 50% con el mismo beneficio · señales de hasta 7 días",
  );
});

test("dos reglas activas el mismo día se advierten", () => {
  assert.deepEqual(
    overlappingDays([
      SCHEDULE,
      { id: "s-2", name: "Tarde", status: "active", weekdays: [3, 4] },
      { id: "s-3", name: "Pausada", status: "paused", weekdays: [1] },
    ]),
    [{ day: 3, names: ["Almuerzo", "Tarde"] }],
  );
});

test("una hora de pared en Chile se convierte con su desfase", () => {
  // Noviembre: horario de verano, UTC-3.
  assert.equal(chileWallTimeToDate("2026-11-05", "19:00")?.toISOString(), "2026-11-05T22:00:00.000Z");
  // Junio: horario de invierno, UTC-4.
  assert.equal(chileWallTimeToDate("2026-06-10", "19:00")?.toISOString(), "2026-06-10T23:00:00.000Z");
  assert.equal(chileWallTimeToDate("2026-13-01", "19:00"), null);
});

test("programar una campaña aplica las mismas reglas que la RPC", () => {
  const now = new Date("2026-11-05T15:00:00Z");
  assert.equal(campaignScheduleError(chileWallTimeToDate("2026-11-05", "19:00"), now), null);
  assert.equal(
    campaignScheduleError(chileWallTimeToDate("2026-11-05", "12:02"), now),
    "La hora programada debe ser al menos 5 minutos en el futuro.",
  );
  assert.equal(
    campaignScheduleError(chileWallTimeToDate("2026-11-06", "08:30"), now),
    "La hora programada debe estar entre las 09:00 y las 21:00 de Chile.",
  );
  assert.equal(
    campaignScheduleError(chileWallTimeToDate("2027-02-01", "12:00"), now),
    "La hora programada no puede estar a más de 60 días.",
  );
  assert.equal(campaignScheduleError(null, now), "Esa hora no existe en Chile ese día.");
});
