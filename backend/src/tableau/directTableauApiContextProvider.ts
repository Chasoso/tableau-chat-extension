import { getConfig } from "../config";
import type { TableauAdditionalContext } from "../types/tableau";
import type { GetAdditionalContextInput, TableauContextProvider } from "./contextProvider";
import { TableauMetadataClient } from "./tableauMetadataClient";
import { TableauRestClient } from "./tableauRestClient";

export class DirectTableauApiContextProvider implements TableauContextProvider {
  readonly name = "direct-api" as const;

  constructor(
    private readonly restClient = new TableauRestClient(),
    private readonly metadataClient = new TableauMetadataClient({ serverUrl: getConfig().tableau.serverUrl }),
  ) {}

  async getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext> {
    const warnings: string[] = [];
    let session;
    const restClient = input.tableauSubject ? new TableauRestClient({ subject: input.tableauSubject }) : this.restClient;

    try {
      session = await restClient.signInWithJwt();
      const [datasourcesResult, metadataResult] = await Promise.allSettled([
        restClient.listDatasources(session),
        input.dashboardContext.workbookName
          ? this.metadataClient.getBasicWorkbookMetadata(session, input.dashboardContext.workbookName)
          : Promise.resolve(null),
      ]);

      if (datasourcesResult.status === "rejected") {
        warnings.push("Datasource lookup failed.");
      }

      if (metadataResult.status === "rejected") {
        warnings.push("Metadata lookup failed.");
      }

      return {
        provider: this.name,
        datasources: datasourcesResult.status === "fulfilled" ? [datasourcesResult.value] : [],
        metadata: metadataResult.status === "fulfilled" ? metadataResult.value : null,
        warnings,
      };
    } catch {
      return {
        provider: this.name,
        warnings: ["Direct Tableau API context lookup failed. Falling back to frontend dashboard context only."],
      };
    } finally {
      if (session) {
        await restClient.signOut(session).catch(() => undefined);
      }
    }
  }
}
