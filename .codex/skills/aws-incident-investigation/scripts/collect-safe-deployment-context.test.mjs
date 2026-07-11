import assert from "node:assert/strict";
import test from "node:test";
import { collectSafeDeploymentContext } from "./collect-safe-deployment-context.mjs";

test("collects a normalized safe deployment context", () => {
  const result = collectSafeDeploymentContext({
    deploymentCommit: "ABCDEF1234567890",
    environment: "dev",
    component: "tableau_metadata",
    operation: "describeDatasource",
    logGroup: "/aws/lambda/dev-stack-chat",
    correlationId: "corr-1",
    requestId: "req-1",
  });

  assert.equal(result.deploymentCommit, "abcdef123456");
  assert.equal(result.environment, "dev");
  assert.equal(result.component, "tableau_metadata");
  assert.equal(result.operation, "describeDatasource");
  assert.equal(result.logGroup, "/aws/lambda/dev-stack-chat");
  assert.equal(result.correlationId, "corr-1");
  assert.equal(result.requestId, "req-1");
  assert.equal(typeof result.capturedAt, "string");
});
