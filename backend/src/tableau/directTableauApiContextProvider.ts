import { getConfig } from "../config";
import { logError, logInfo, logWarn, safeErrorDetails, safeHash } from "../logging";
import type { TableauAdditionalContext } from "../types/tableau";
import type { GetAdditionalContextInput, TableauContextProvider } from "./contextProvider";
import { TableauMetadataClient } from "./tableauMetadataClient";
import { TableauRestClient, type TableauSession } from "./tableauRestClient";

export class DirectTableauApiContextProvider implements TableauContextProvider {
  readonly name = "direct-api" as const;

  constructor(
    private readonly restClient = new TableauRestClient(),
    private readonly metadataClient = new TableauMetadataClient({ serverUrl: getConfig().tableau.serverUrl }),
  ) {}

  async getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext> {
    const warnings: string[] = [];
    let session: TableauSession | undefined;
    const restClient = input.tableauSubject ? new TableauRestClient({ subject: input.tableauSubject }) : this.restClient;

    try {
      logInfo("tableau.direct.sign_in.started", {
        tableauSubjectHash: safeHash(input.tableauSubject),
        dashboardName: input.dashboardContext.dashboardName,
        workbookName: input.dashboardContext.workbookName ?? undefined,
      });
      session = await restClient.signInWithJwt();
      logInfo("tableau.direct.sign_in.completed", {
        tableauSubjectHash: safeHash(input.tableauSubject),
        siteIdHash: safeHash(session.siteId),
        userIdHash: safeHash(session.userId),
      });
      const [datasourcesResult, metadataResult] = await Promise.allSettled([
        restClient.listDatasources(session),
        input.dashboardContext.workbookName
          ? this.metadataClient.getBasicWorkbookMetadata(session, input.dashboardContext.workbookName)
          : Promise.resolve(null),
      ]);

      if (datasourcesResult.status === "rejected") {
        warnings.push("Datasource lookup failed.");
        logWarn("tableau.direct.datasources.failed", safeErrorDetails(datasourcesResult.reason));
      } else {
        logInfo("tableau.direct.datasources.completed", {
          resultType: typeof datasourcesResult.value,
        });
      }

      if (metadataResult.status === "rejected") {
        warnings.push("Metadata lookup failed.");
        logWarn("tableau.direct.metadata.failed", safeErrorDetails(metadataResult.reason));
      } else {
        logInfo("tableau.direct.metadata.completed", {
          hasMetadata: Boolean(metadataResult.value),
        });
      }

      return {
        provider: this.name,
        datasources: datasourcesResult.status === "fulfilled" ? [datasourcesResult.value] : [],
        metadata: metadataResult.status === "fulfilled" ? metadataResult.value : null,
        warnings,
      };
    } catch (error) {
      logError("tableau.direct.lookup.failed", safeErrorDetails(error));
      return {
        provider: this.name,
        warnings: ["Direct Tableau API context lookup failed. Falling back to frontend dashboard context only."],
      };
    } finally {
      if (session) {
        await restClient.signOut(session)
          .then(() => {
            logInfo("tableau.direct.sign_out.completed", {
              siteIdHash: safeHash(session?.siteId),
              userIdHash: safeHash(session?.userId),
            });
          })
          .catch((error) => {
            logWarn("tableau.direct.sign_out.failed", safeErrorDetails(error));
          });
      }
    }
  }
}
