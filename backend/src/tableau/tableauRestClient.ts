import { getConfig } from "../config";
import { getTableauConnectedAppSecrets } from "../aws/secrets";
import { generateTableauConnectedAppJwt } from "./tableauAuth";

export type TableauSession = {
  token: string;
  siteId: string;
  userId: string;
};

export type TableauRestClientOptions = {
  serverUrl?: string;
  siteContentUrl?: string;
  apiVersion?: string;
  subject?: string;
  scopes?: string[];
};

export class TableauRestClient {
  private readonly serverUrl: string;
  private readonly siteContentUrl: string;
  private readonly apiVersion: string;
  private readonly subject: string;
  private readonly scopes: string[];

  constructor(options: TableauRestClientOptions = {}) {
    const config = getConfig();
    this.serverUrl = trimTrailingSlash(options.serverUrl ?? config.tableau.serverUrl);
    this.siteContentUrl = options.siteContentUrl ?? config.tableau.siteContentUrl;
    this.apiVersion = options.apiVersion ?? config.tableau.apiVersion;
    this.subject = options.subject ?? config.tableau.defaultSubject;
    this.scopes = options.scopes ?? config.tableau.scopes;
  }

  async signInWithJwt(): Promise<TableauSession> {
    if (!this.serverUrl || !this.subject) {
      throw new Error("Tableau server URL and subject must be configured.");
    }

    const connectedApp = await getTableauConnectedAppSecrets();
    const token = generateTableauConnectedAppJwt({
      connectedApp,
      subject: this.subject,
      scopes: this.scopes,
    });

    const response = await fetch(`${this.serverUrl}/api/${this.apiVersion}/auth/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        credentials: {
          jwt: token,
          site: {
            contentUrl: this.siteContentUrl,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Tableau sign in failed with status ${response.status}.`);
    }

    const body = (await response.json()) as {
      credentials?: {
        token?: string;
        site?: { id?: string };
        user?: { id?: string };
      };
    };

    const credentials = body.credentials;
    if (!credentials?.token || !credentials.site?.id || !credentials.user?.id) {
      throw new Error("Tableau sign in response did not include required credentials.");
    }

    return {
      token: credentials.token,
      siteId: credentials.site.id,
      userId: credentials.user.id,
    };
  }

  async signOut(session: TableauSession): Promise<void> {
    await this.makeAuthenticatedRequest(session, `/auth/signout`, {
      method: "POST",
    });
  }

  async getWorkbook(session: TableauSession, workbookId: string): Promise<unknown> {
    return this.makeAuthenticatedRequest(session, `/sites/${session.siteId}/workbooks/${workbookId}`);
  }

  async getWorkbookConnections(session: TableauSession, workbookId: string): Promise<unknown> {
    return this.makeAuthenticatedRequest(session, `/sites/${session.siteId}/workbooks/${workbookId}/connections`);
  }

  async listDatasources(session: TableauSession): Promise<unknown> {
    return this.makeAuthenticatedRequest(session, `/sites/${session.siteId}/datasources`);
  }

  async makeAuthenticatedRequest<T = unknown>(
    session: TableauSession,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${this.serverUrl}/api/${this.apiVersion}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
        "X-Tableau-Auth": session.token,
      },
    });

    if (!response.ok) {
      throw new Error(`Tableau REST API request failed with status ${response.status}.`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

