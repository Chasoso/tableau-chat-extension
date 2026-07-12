import assert from "node:assert/strict";
import test from "node:test";
import { validateDiagnosticSummary } from "./validate-diagnostic-summary.mjs";

test("accepts a safe summary", () => {
  const result = validateDiagnosticSummary({
    component: "hosted_metadata_transport",
    operation: "describeDatasource",
    errorCode: "TIMEOUT",
    result: "failure",
  });

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
});

test("rejects emails, JWTs, and authorization headers", () => {
  const result = validateDiagnosticSummary({
    email: "user@example.com",
    jwt: "aaa.bbb.ccc",
    authorization: "Authorization: Bearer abc.def.ghi",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.findings.some((finding) => finding.kind === "email"),
    true,
  );
  assert.equal(
    result.findings.some((finding) => finding.kind === "jwt"),
    true,
  );
  assert.equal(
    result.findings.some((finding) => finding.kind === "authorization_header"),
    true,
  );
});
