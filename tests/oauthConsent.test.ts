import assert from "node:assert/strict";
import test from "node:test";

import { consentLoginPath, describeScopes, redirectHost, safeNextPath } from "../src/lib/oauthConsent.ts";

test("only internal paths are accepted after login", () => {
  assert.equal(safeNextPath("/oauth/consent?authorization_id=a"), "/oauth/consent?authorization_id=a");
  assert.equal(safeNextPath("https://evil.example.com"), null);
  assert.equal(safeNextPath("//evil.example.com"), null);
  assert.equal(safeNextPath("/\\evil.example.com"), null);
  assert.equal(safeNextPath(null), null);
});

test("the login path comes back to the same authorization", () => {
  const path = consentLoginPath("abc 1");
  assert.equal(path, "/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc%25201");
  const next = new URLSearchParams(path.split("?")[1]).get("next");
  assert.equal(safeNextPath(next), "/oauth/consent?authorization_id=abc%201");
});

test("scopes and redirect are shown in plain words", () => {
  assert.deepEqual(describeScopes("openid  email custom"), ["Confirmar tu identidad", "Ver tu correo", "custom"]);
  assert.equal(redirectHost("https://chatgpt.com/connector_platform_oauth_redirect"), "chatgpt.com");
  assert.equal(redirectHost("no-url"), "no-url");
});
