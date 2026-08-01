import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCorrectionReprocessBody,
  getChangedCorrectionFields,
  getFunctionErrorMessage,
  getReprocessFailureMessage,
} from "../src/lib/correctionReprocess.ts";

test("builds a correction-only payload with exactly the fields saved by this request", () => {
  const body = buildCorrectionReprocessBody(
    "8a10ec98-37de-45d9-9a5b-d30fe43e3162",
    ["image_url", "needs_review"],
    true,
  );

  assert.deepEqual(body, {
    correctionOnly: true,
    correctedFields: ["image_url", "needs_review"],
    force: true,
    rawBenefitId: "8a10ec98-37de-45d9-9a5b-d30fe43e3162",
    runKind: "correction",
  });
});

test("does not dispatch an empty correction", () => {
  assert.equal(buildCorrectionReprocessBody("8a10ec98-37de-45d9-9a5b-d30fe43e3162", [], false), null);
});

test("selects only values changed by the current save, including removed overrides", () => {
  assert.deepEqual(getChangedCorrectionFields(
    { channel: "online", image_url: "https://example.com/old.webp", value: 20 },
    { channel: "online", image_url: "https://example.com/new.webp" },
  ), ["image_url", "value"]);
});

test("includes a correlation reference in service errors", () => {
  assert.equal(
    getReprocessFailureMessage({ error: "No se pudo iniciar.", requestId: "req-123" }, "Error genérico"),
    "No se pudo iniciar. (referencia: req-123)",
  );
});

test("reads the Edge Function error body and preserves its correlation reference", async () => {
  const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    context: new Response(JSON.stringify({ error: "GitHub no respondió.", requestId: "req-456" }), {
      headers: { "content-type": "application/json" },
      status: 502,
    }),
  });

  assert.equal(await getFunctionErrorMessage(error), "GitHub no respondió. (referencia: req-456)");
});
