export type AppConfig = {
  chatHistoryTableName?: string;
  useInMemoryRepository: boolean;
  corsAllowedOrigin: string;
  tableau: {
    serverUrl: string;
    siteContentUrl: string;
    apiVersion: string;
    authMode: "connected-app";
    defaultSubject: string;
    scopes: string[];
  };
};

export function getConfig(): AppConfig {
  return {
    chatHistoryTableName: process.env.CHAT_HISTORY_TABLE_NAME,
    useInMemoryRepository: process.env.USE_IN_MEMORY_REPOSITORY !== "false",
    corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "*",
    tableau: {
      serverUrl: process.env.TABLEAU_SERVER_URL ?? "",
      siteContentUrl: process.env.TABLEAU_SITE_CONTENT_URL ?? "",
      apiVersion: process.env.TABLEAU_API_VERSION ?? "3.25",
      authMode: "connected-app",
      defaultSubject: process.env.TABLEAU_DEFAULT_SUBJECT ?? "",
      scopes: parseScopes(process.env.TABLEAU_SCOPES),
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

