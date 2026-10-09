import assert from "node:assert/strict";
import test from "node:test";

import {
  describeDelivery,
  isInProgress,
  locationLabel,
  nearbyCount,
  reasonLabel,
  sendBlocker,
  skippedCount,
} from "../src/lib/personalizedNotifications.ts";

// 12:00 en Chile del 9 de octubre de 2026.
const NOON = new Date("2026-10-09T15:00:00Z");
const ready = { status: "ready" as const, summary: { selected: 4 }, as_of: "2026-10-09T14:00:00Z" };

test("sending requires the exact recipient count on the preview's Chile day", () => {
  assert.equal(sendBlocker(ready, "4", NOON), null);
  assert.equal(sendBlocker(ready, " 4 ", NOON), null);
  assert.match(sendBlocker(ready, "40", NOON) ?? "", /Escribe 4/);
  assert.match(sendBlocker(ready, "", NOON) ?? "", /Escribe 4/);
  assert.match(sendBlocker({ ...ready, as_of: "2026-10-08T15:00:00Z" }, "4", NOON) ?? "", /otro día/);
  assert.match(sendBlocker({ ...ready, status: "sent" }, "4", NOON) ?? "", /no está lista/);
  assert.match(sendBlocker({ ...ready, summary: { selected: 0 } }, "0", NOON) ?? "", /Nadie/);
});

test("late night in Chile is still the same day as the preview", () => {
  // 23:30 del 9 en Chile es 02:30 UTC del 10.
  assert.equal(sendBlocker(ready, "4", new Date("2026-10-10T02:30:00Z")), null);
});

test("only terminal states stop polling", () => {
  for (const status of ["queued", "planning", "approved", "sending"] as const) assert.equal(isInProgress(status), true);
  for (const status of ["ready", "sent", "failed"] as const) assert.equal(isInProgress(status), false);
});

test("labels explain location and reasons in plain Spanish", () => {
  assert.equal(locationLabel("primary_commune"), "En su comuna principal");
  assert.equal(locationLabel(undefined), "—");
  assert.equal(reasonLabel("cooldown"), "Recibió una notificación hace poco");
  assert.equal(reasonLabel("not_reachable"), "No tiene notificaciones activadas");
  assert.equal(reasonLabel("algo_nuevo"), "algo_nuevo");
});

test("summary helpers add the counts the operator reads", () => {
  const summary = { skipped: 3, not_reachable: 2, location_primary_commune: 10, location_other_commune: 5 };
  assert.equal(skippedCount(summary), 5);
  assert.equal(nearbyCount(summary), 15);
  assert.equal(nearbyCount(null), 0);
});

test("delivery result reads like a sentence", () => {
  assert.equal(describeDelivery({ expo_accepted: 4 }), "4 aceptadas por Expo.");
  assert.equal(
    describeDelivery({ expo_accepted: 3, failed: 1, skipped: 2, sending: 1 }),
    "3 aceptadas por Expo, 1 fallidas, 2 omitidas al enviar, 1 sin confirmar.",
  );
  assert.equal(describeDelivery(null), "Sin resultado de envío.");
});
