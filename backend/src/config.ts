export type AppConfig = {
  chatHistoryTableName?: string;
  useInMemoryRepository: boolean;
  chatMemoryMessageLimit: number;
  corsAllowedOrigin: string;
  model: {
    provider: "mock" | "bedrock";
    bedrock: {
      region: string;
      modelId: string;
      maxOutputTokens: number;
      temperature: number;
    };
  };
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
      command: string;
      args: string[];
      allowedTools: string[];
      maxToolCalls: number;
      debugLogResults: boolean;
      toolPlanningEnabled: boolean;
      plannerMaxOutputTokens: number;
      metadataCacheEnabled: boolean;
      metadataCacheTtlMs: number;
      queryDatasourceMaxLimit: number;
      queryDatasourceMaxFields: number;
    };
  };
};

export function getConfig(): AppConfig {
  return {
    chatHistoryTableName: process.env.CHAT_HISTORY_TABLE_NAME,
    useInMemoryRepository: process.env.USE_IN_MEMORY_REPOSITORY !== "false",
    chatMemoryMessageLimit: Number(process.env.CHAT_MEMORY_MESSAGE_LIMIT ?? 10),
    corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "*",
    model: {
      provider: parseModelProvider(process.env.MODEL_PROVIDER),
      bedrock: {
        region: process.env.BEDROCK_REGION ?? "us-east-1",
        modelId: process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-2-lite-v1:0",
        maxOutputTokens: Number(process.env.BEDROCK_MAX_OUTPUT_TOKENS ?? 2400),
        temperature: Number(process.env.BEDROCK_TEMPERATURE ?? 0.2),
      },
    },
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
        transport: process.env.TABLEAU_MCP_TRANSPORT ?? "stdio",
        authMode: process.env.TABLEAU_MCP_AUTH_MODE ?? "direct-trust",
        timeoutMs: Number(process.env.TABLEAU_MCP_TIMEOUT_MS ?? 5000),
        command: process.env.TABLEAU_MCP_COMMAND ?? "",
        args: parseCsv(process.env.TABLEAU_MCP_ARGS),
        allowedTools: parseCsv(process.env.TABLEAU_MCP_ALLOWED_TOOLS),
        maxToolCalls: Number(process.env.TABLEAU_MCP_MAX_TOOL_CALLS ?? 3),
        debugLogResults: process.env.TABLEAU_MCP_DEBUG_LOG_RESULTS === "true",
        toolPlanningEnabled: process.env.TABLEAU_MCP_TOOL_PLANNING_ENABLED === "true",
        plannerMaxOutputTokens: Number(process.env.TABLEAU_MCP_PLANNER_MAX_OUTPUT_TOKENS ?? 600),
        metadataCacheEnabled: process.env.TABLEAU_MCP_METADATA_CACHE_ENABLED !== "false",
        metadataCacheTtlMs: Number(process.env.TABLEAU_MCP_METADATA_CACHE_TTL_MS ?? 30000),
        queryDatasourceMaxLimit: Number(process.env.TABLEAU_MCP_QUERY_MAX_LIMIT ?? 50),
        queryDatasourceMaxFields: Number(process.env.TABLEAU_MCP_QUERY_MAX_FIELDS ?? 6),
      },
    },
  };
}

function parseModelProvider(value: string | undefined): AppConfig["model"]["provider"] {
  if (value === "bedrock") {
    return "bedrock";
  }

  return "mock";
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

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
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
