import { afterEach, describe, expect, it } from "vitest";
import { createHostedMetadataDiscoveryTransport } from "../src/agent";

const ENV_KEYS = [
  "TABLEAU_MCP_HOSTED_ENABLED",
  "TABLEAU_MCP_HOSTED_ENDPOINT",
  "TABLEAU_MCP_HOSTED_TIMEOUT_MS",
  "TABLEAU_MCP_HOSTED_SITE_ID",
  "TABLEAU_MCP_HOSTED_SITE_CONTENT_URL",
  "TABLEAU_CONNECTED_APP_CLIENT_ID",
  "TABLEAU_CONNECTED_APP_SECRET_ID",
  "TABLEAU_CONNECTED_APP_SECRET_VALUE",
];

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]] as const),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("hosted metadata discovery transport", () => {
  it("stays disabled when the hosted feature flag is off", () => {
    delete process.env.TABLEAU_MCP_HOSTED_ENABLED;
    const transport = createHostedMetadataDiscoveryTransport();

    expect(transport).toBeUndefined();
  });

  it("returns a safe not_configured result when the hosted endpoint is missing", async () => {
    process.env.TABLEAU_MCP_HOSTED_ENABLED = "true";
    delete process.env.TABLEAU_MCP_HOSTED_ENDPOINT;
    delete process.env.TABLEAU_CONNECTED_APP_CLIENT_ID;
    delete process.env.TABLEAU_CONNECTED_APP_SECRET_ID;
    delete process.env.TABLEAU_CONNECTED_APP_SECRET_VALUE;

    const transport = createHostedMetadataDiscoveryTransport({
      authenticatedUser: {
        userId: "user-1",
        email: "user@example.com",
        tableauSubject: "user@example.com",
        tokenUse: "id",
      },
    });

    expect(transport).toBeDefined();
    const result = await transport!.call({
      requestId: "request-1",
      toolName: "tableau.metadata.describeDatasource",
      input: {
        datasource: {
          datasourceId: "datasource-1",
        },
      },
      userContext: {
        userId: "user-1",
        tableauUserId: "user@example.com",
        email: "user@example.com",
      },
      authContext: {
        mode: "direct_trust",
        state: "ready",
      },
    });

    expect(result.status).toBe("not_configured");
    expect(result.error?.code).toBe("TRANSPORT_NOT_CONFIGURED");
    expect(JSON.stringify(result)).not.toContain("accessToken");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
