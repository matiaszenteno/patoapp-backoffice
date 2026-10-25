import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptedByExpo,
  acceptedByProvider,
  buildCampaignData,
  campaignStatusLabel,
  canCancelCampaign,
  createCampaignSchema,
  defaultCampaignValues,
  describeCampaignSendResult,
  draftRpcParams,
  parseDraftRow,
  parseTestCampaignId,
  inAppCampaignPushProblem,
  type InAppCampaignOption,
  pendingDelivery,
  sendConfirmationMessage,
  totalFailed,
} from "../src/lib/notificationCampaigns.ts";

test("builds every destination supported by the mobile contract", () => {
  assert.equal(buildCampaignData({ ...defaultCampaignValues, dest: "none" }), null);
  assert.deepEqual(buildCampaignData({ ...defaultCampaignValues, dest: "profile" }), { dest: "profile" });
  assert.deepEqual(
    buildCampaignData({
      ...defaultCampaignValues,
      dest: "nearby",
      discoveryFilter: "category",
      category_slug: "restaurantes",
    }),
    { dest: "nearby", category_slug: "restaurantes" },
  );
  assert.deepEqual(
    buildCampaignData({
      ...defaultCampaignValues,
      dest: "nearby",
      discoveryFilter: "query",
      query: "  café  ",
    }),
    { dest: "nearby", query: "café" },
  );
});

test("rejects discovery searches shorter than remote config", () => {
  const result = createCampaignSchema(3).safeParse({
    ...defaultCampaignValues,
    dest: "feed",
    discoveryFilter: "query",
    query: "té",
  });
  assert.equal(result.success, false);
});

test("does not report success when the function returns a logical error", () => {
  assert.deepEqual(
    describeCampaignSendResult("campaign-1", {
      results: [{ id: "campaign-1", error: "Destino inválido." }],
    }),
    { ok: false, message: "Destino inválido." },
  );
  assert.equal(
    describeCampaignSendResult("campaign-1", { results: [] }).ok,
    false,
  );
});

test("separates Expo acceptance from provider receipts", () => {
  const counts = {
    campaign_id: "campaign-1",
    total: 12,
    selected: 0,
    skipped: 2,
    sending: 1,
    expo_accepted: 3,
    receipt_ok: 4,
    receipt_failed: 1,
    failed: 1,
    opened: 1,
  };
  assert.equal(acceptedByExpo(counts), 9);
  assert.equal(acceptedByProvider(counts), 5);
  assert.equal(pendingDelivery(counts), 1);
  assert.equal(totalFailed(counts), 2);
});

test("draft params create first and then edit the reviewed version", () => {
  const values = {
    ...defaultCampaignValues,
    title: "  Beneficios nuevos ",
    body: " Mira lo nuevo ",
    dest: "profile" as const,
    audience: "users" as const,
    target_user_ids: ["u-1"],
  };
  assert.deepEqual(draftRpcParams(values, null), {
    title: "Beneficios nuevos",
    body: "Mira lo nuevo",
    data: { dest: "profile" },
    target: "users",
    target_user_ids: ["u-1"],
    campaign_id: null,
    expected_version: null,
  });
  const edit = draftRpcParams({ ...values, audience: "all" }, { id: "c-1", version: 3 });
  assert.equal(edit.campaign_id, "c-1");
  assert.equal(edit.expected_version, 3);
  assert.equal(edit.target_user_ids, null);
});

test("draft and test rows are parsed defensively", () => {
  assert.deepEqual(parseDraftRow([{ id: "c-1", version: 2, status: "draft" }]), { id: "c-1", version: 2 });
  assert.equal(parseDraftRow([]), null);
  assert.equal(parseDraftRow([{ id: "c-1" }]), null);
  assert.equal(parseTestCampaignId([{ test_campaign_id: "t-1", recipients: 1 }]), "t-1");
  assert.equal(parseTestCampaignId(null), null);
});

test("status labels and cancellation follow the campaign lifecycle", () => {
  assert.equal(campaignStatusLabel("draft"), "Borrador");
  assert.equal(campaignStatusLabel("pending"), "Aprobada");
  assert.equal(campaignStatusLabel("cancelled"), "Cancelada");
  assert.equal(canCancelCampaign("draft"), true);
  assert.equal(canCancelCampaign("pending"), true);
  assert.equal(canCancelCampaign("sending"), false);
  assert.equal(canCancelCampaign("sent"), false);
});

test("the send confirmation names the audience", () => {
  assert.match(
    sendConfirmationMessage({ ...defaultCampaignValues, title: "Hola", audience: "all" }),
    /TODAS las personas/,
  );
  assert.match(
    sendConfirmationMessage({ ...defaultCampaignValues, title: "Hola", audience: "users", target_user_ids: ["a", "b"] }),
    /2 usuario\(s\)/,
  );
});

const IN_APP_ID = "66666666-7777-8888-9999-000000000000";
const NOW = new Date("2026-10-24T12:00:00Z");
const IN_APP: InAppCampaignOption = {
  id: IN_APP_ID,
  image_url: "https://example.com/emisores.png",
  accessibility_label: "3 nuevos emisores",
  cta_label: "Agregar emisores",
  starts_at: "2026-10-24T00:00:00Z",
  ends_at: null,
  target: "all",
  target_user_ids: null,
};

test("builds a push that announces an in-app campaign", () => {
  assert.deepEqual(
    buildCampaignData({ ...defaultCampaignValues, dest: "in_app_campaign", in_app_campaign_id: IN_APP_ID }),
    { dest: "in_app_campaign", campaign_id: IN_APP_ID },
  );
  const missing = createCampaignSchema(3).safeParse({
    ...defaultCampaignValues,
    title: "Nuevos emisores",
    body: "Toca para verlos",
    dest: "in_app_campaign",
  });
  assert.equal(missing.success, false);
});

test("warns about an in-app campaign that send-campaign would reject", () => {
  assert.equal(inAppCampaignPushProblem(IN_APP, "all", [], NOW), null);
  assert.equal(
    inAppCampaignPushProblem({ ...IN_APP, starts_at: "2026-10-25T00:00:00Z" }, "all", [], NOW),
    "La campaña in-app todavía no empieza.",
  );
  assert.equal(
    inAppCampaignPushProblem({ ...IN_APP, ends_at: "2026-10-25T11:00:00Z" }, "all", [], NOW),
    "La campaña in-app termina en menos de 24 horas.",
  );
  const listed = { ...IN_APP, target: "users" as const, target_user_ids: ["u-1", "u-2"] };
  assert.match(inAppCampaignPushProblem(listed, "all", [], NOW) ?? "", /usuarios específicos/);
  assert.match(inAppCampaignPushProblem(listed, "users", ["u-3"], NOW) ?? "", /subconjunto/);
  assert.equal(inAppCampaignPushProblem(listed, "users", ["u-1"], NOW), null);
});
