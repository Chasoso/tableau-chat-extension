import process from "node:process";

const mode = process.argv[2] ?? "--deploy";

if (!["--deploy", "--preflight"].includes(mode)) {
  console.error("Usage: deploy-settings-check.mjs [--deploy|--preflight]");
  process.exit(1);
}

const alwaysRequiredSettings = [
  "AWS_REGION",
  "STACK_NAME",
  "AWS_GHA_DEPLOY_ROLE_ARN",
  "AWS_CFN_EXECUTION_ROLE_ARN",
  "AWS_ARTIFACT_BUCKET",
  "FRONTEND_BUCKET_NAME",
  "VITE_API_BASE_URL",
  "EXTENSION_SOURCE_URL",
  "CORS_ALLOWED_ORIGIN",
  "TABLEAU_SERVER_URL",
  "TABLEAU_SITE_CONTENT_URL",
  "TABLEAU_CONNECTED_APP_CLIENT_ID",
  "TABLEAU_CONNECTED_APP_SECRET_ID",
  "TABLEAU_CONNECTED_APP_SECRET_VALUE",
  "TABLEAU_DEFAULT_SUBJECT",
];

const authRequiredSettings = [
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_REGION",
  "COGNITO_DOMAIN",
  "COGNITO_POPUP_REDIRECT_URI",
  "VITE_COGNITO_DOMAIN",
  "VITE_COGNITO_REDIRECT_URI",
];

const hostedRequiredSettings = ["TABLEAU_MCP_HOSTED_ENDPOINT"];

const missing = alwaysRequiredSettings.filter(isMissing);

if (process.env.AUTH_REQUIRED === "true") {
  missing.push(...authRequiredSettings.filter(isMissing));
}

if (process.env.TABLEAU_MCP_HOSTED_ENABLED === "true") {
  missing.push(...hostedRequiredSettings.filter(isMissing));
}

if (missing.length > 0) {
  console.error(
    [
      mode === "--preflight"
        ? "Deployment preflight failed because required settings are missing."
        : "Deployment validation failed because required settings are missing.",
      ...missing.map((name) => `- ${name}`),
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  mode === "--preflight"
    ? "Deployment preflight settings check passed."
    : "Deployment settings check passed.",
);

function isMissing(name) {
  return !`${process.env[name] ?? ""}`.trim();
}
