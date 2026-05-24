export type AppConfig = {
  chatHistoryTableName?: string;
  useInMemoryRepository: boolean;
  corsAllowedOrigin: string;
  auth: {
    required: boolean;
    cognitoUserPoolId: string;
    cognitoClientId: string;
    cognitoRegion: string;
  };
  tableau: {
    serverUrl: string;
    siteContentUrl: string;
    apiVersion: string;
    authMode: "connected-app";
    defaultSubject: string;
    scopes: string[];
    contextProvider: "mock" | "direct-api" | "mcp";
    mcp: {
      serverUrl: string;
      transport: string;
      authMode: string;
      timeoutMs: number;
    };
  };
};

export function getConfig(): AppConfig {
  return {
    chatHistoryTableName: process.env.CHAT_HISTORY_TABLE_NAME,
    useInMemoryRepository: process.env.USE_IN_MEMORY_REPOSITORY !== "false",
    corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "*",
    auth: {
      required: process.env.AUTH_REQUIRED === "true",
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID ?? "",
      cognitoClientId: process.env.COGNITO_CLIENT_ID ?? "",
      cognitoRegion: process.env.COGNITO_REGION ?? "",
    },
    tableau: {
      serverUrl: process.env.TABLEAU_SERVER_URL ?? "",
      siteContentUrl: process.env.TABLEAU_SITE_CONTENT_URL ?? "",
      apiVersion: process.env.TABLEAU_API_VERSION ?? "3.25",
      authMode: "connected-app",
      defaultSubject: process.env.TABLEAU_DEFAULT_SUBJECT ?? "",
      scopes: parseScopes(process.env.TABLEAU_SCOPES),
      contextProvider: parseContextProvider(process.env.TABLEAU_CONTEXT_PROVIDER),
      mcp: {
        serverUrl: process.env.TABLEAU_MCP_SERVER_URL ?? "",
        transport: process.env.TABLEAU_MCP_TRANSPORT ?? "http",
        authMode: process.env.TABLEAU_MCP_AUTH_MODE ?? "none",
        timeoutMs: Number(process.env.TABLEAU_MCP_TIMEOUT_MS ?? 5000),
      },
    },
  };
}

function parseScopes(value: string | undefined): string[] {
  if (!value) {
    return ["tableau:content:read"];
  }

  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function parseContextProvider(value: string | undefined): AppConfig["tableau"]["contextProvider"] {
  if (value === "direct-api" || value === "direct") {
    return "direct-api";
  }

  if (value === "mcp") {
    return "mcp";
  }

  return "mock";
}
