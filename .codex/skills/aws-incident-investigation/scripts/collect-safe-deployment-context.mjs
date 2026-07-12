import process from "node:process";
import { pathToFileURL } from "node:url";

export function collectSafeDeploymentContext(input = {}) {
  const deploymentCommit =
    normalizeCommit(input.deploymentCommit ?? process.env.GIT_COMMIT_SHA) ??
    "unknown";
  const environment =
    input.environment ?? process.env.DEPLOYMENT_ENVIRONMENT ?? "dev";
  const component = input.component ?? "unknown";
  const operation = input.operation ?? "unknown";

  return {
    deploymentCommit,
    environment,
    component,
    operation,
    logGroup: input.logGroup ?? "unknown",
    correlationId: input.correlationId,
    requestId: input.requestId,
    capturedAt: new Date().toISOString(),
  };
}

function normalizeCommit(value) {
  if (!value) {
    return undefined;
  }

  const trimmed = String(value).trim();
  if (!/^[0-9a-f]{7,40}$/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.slice(0, 12).toLowerCase();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = collectSafeDeploymentContext({
    deploymentCommit: process.argv[2],
    environment: process.argv[3],
    component: process.argv[4],
    operation: process.argv[5],
    logGroup: process.argv[6],
  });

  console.log(JSON.stringify(result, null, 2));
}
