import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptedByExpo,
  acceptedByProvider,
  buildCampaignData,
  createCampaignSchema,
  defaultCampaignValues,
  describeCampaignSendResult,
  pendingDelivery,
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
