import { getConfig } from "../config";
import { authenticateRequest } from "../auth/cognitoAuth";
import {
  createAgentRunId,
  buildOrchestrationIntentResolutionTraceMetadata,
  createDefaultIntentResolver,
  createLambdaAgentRunner,
  runMetadataDiscoveryOrchestration,
  runSelectedMarkExplanationOrchestration,
  type AgentIntent,
  type AgentRunInput,
  type AgentRunResult,
  type AgentPlan,
  type ContextPack,
  type JsonObject,
  type IntentId,
  type IntentResolutionInput,
  type OrchestrationTraceContextSummary,
  type TraceEvent,
} from "../agent";
import {
  logError,
  logInfo,
  logWarn,
  safeErrorDetails,
  safeHash,
} from "../logging";
import { ChatJobService } from "../services/chatJobService";
import { createChatService } from "../services/chatService";
import type {
  ApiGatewayProxyEvent,
  ApiGatewayProxyResult,
  LambdaExecutionContext,
} from "../types/api";
import type { ChatRequest, ContextRequest } from "../types/chat";
import type { AuthenticatedUser } from "../types/auth";
import type {
  ResolveIntentRequest,
  ResolveIntentResponse,
} from "../types/orchestration";
import { handleNotionRoute } from "./notionHandler";
import { handleCognitoPopupAuthRoute } from "./cognitoPopupAuthHandler";

const chatJobService = new ChatJobService();
type SelectedMarkOrchestrationResult = Awaited<
  ReturnType<typeof runSelectedMarkExplanationOrchestration>
>;

export async function handler(
  event: ApiGatewayProxyEvent,
  context?: LambdaExecutionContext,
): Promise<ApiGatewayProxyResult> {
  const requestId = event.requestContext?.requestId;
  const method = event.httpMethod ?? event.requestContext?.http?.method;
  const routePath = getRoutePath(event);
  const isChatJobRoute = routePath.startsWith("/chat-jobs");
  const isNotionCallbackRoute = routePath.startsWith("/notion/callback");
  const isCognitoPopupAuthRoute = routePath.startsWith("/auth/cognito/");

  if (method === "OPTIONS") {
    return jsonResponse(204, {});
  }

  try {
    logInfo("chat.request.received", { requestId, method, routePath });
    const authResult =
      isNotionCallbackRoute || isCognitoPopupAuthRoute
        ? { ok: true as const, user: undefined }
        : await authenticateRequest(event.headers);
    if (!authResult.ok) {
      logWarn("chat.auth.rejected", {
        requestId,
        statusCode: authResult.statusCode,
      });
      return jsonResponse(authResult.statusCode, {
        message: authResult.message,
      });
    }
    logInfo("chat.auth.accepted", {
      requestId,
      userHash: safeHash(authResult.user?.userId),
      emailHash: safeHash(authResult.user?.email),
      tableauSubjectHash: safeHash(authResult.user?.tableauSubject),
      tokenUse: authResult.user?.tokenUse,
    });

    if (routePath.startsWith("/notion")) {
      return handleNotionRoute(event, authResult.user);
    }
    if (routePath.startsWith("/auth/cognito")) {
      return handleCognitoPopupAuthRoute(event);
    }

    if (routePath === "/chat-jobs" && method === "POST") {
      const request = parseRequest(event.body) as ChatRequest;
      const validationError = validateRequest(request);
      if (validationError) {
        logWarn("chat.job_request.invalid", {
          requestId,
          validationError,
        });
        return jsonResponse(400, { message: validationError });
      }

      const response = await chatJobService.createChatJob({
        request,
        authenticatedUser: authResult.user,
        headers: event.headers,
        requestId,
      });
      logInfo("chat.job.request.created", {
        requestId,
        jobId: response.jobId,
        status: response.status,
      });
      return jsonResponse(202, response);
    }

    if (routePath.startsWith("/chat-jobs/") && method === "GET") {
      const jobId = parseJobId(routePath);
      if (!jobId) {
        return jsonResponse(400, { message: "jobId is required." });
      }

      const response = await chatJobService.getChatJob({
        jobId,
        authenticatedUser: authResult.user,
        headers: event.headers,
      });
      logInfo("chat.job.request.fetched", {
        requestId,
        jobId,
        status: response.status,
        stage: response.stage,
      });
      return jsonResponse(200, response);
    }

    if (routePath === "/chat-jobs" && method !== "POST") {
      return jsonResponse(405, {
        message: "Method not allowed.",
      });
    }

    if (routePath.startsWith("/chat-jobs/") && method !== "GET") {
      return jsonResponse(405, {
        message: "Method not allowed.",
      });
    }

    if (routePath === "/intent/resolve" && method !== "POST") {
      return jsonResponse(405, {
        message: "Method not allowed.",
      });
    }

    const request = parseRequest(event.body);

    if (routePath === "/context") {
      const contextRequest = request as ContextRequest;
      const validationError = validateContextRequest(contextRequest);
      if (validationError) {
        logWarn("chat.context_request.invalid", { requestId, validationError });
        return jsonResponse(400, { message: validationError });
      }

      const response = await createChatService().getDashboardContextPatch(
        contextRequest,
        authResult.user,
      );
      logInfo("chat.context_request.completed", {
        requestId,
        provider: response.debug?.tableauContextProvider,
        patchedFields: response.dashboardContextPatch?.workbookName
          ? ["workbookName"]
          : [],
      });
      return jsonResponse(200, response);
    }

    if (routePath === "/intent/resolve") {
      if (method !== "POST") {
        return jsonResponse(405, {
          message: "Method not allowed.",
        });
      }

      const intentRequest = request as ResolveIntentRequest;
      const validationError = validateResolveIntentRequest(intentRequest);
      if (validationError) {
        logWarn("chat.intent_request.invalid", {
          requestId,
          validationError,
        });
        return jsonResponse(400, { message: validationError });
      }

      const resolver = createDefaultIntentResolver();
      const intentResolutionInput = buildIntentResolutionInput(intentRequest);
      const shouldRunOrchestration =
        intentRequest.runMode === "resolve_and_execute_fixed_plan";
      const shouldRunMetadataDiscoveryOrchestration =
        intentRequest.runMode === "resolve_and_execute_metadata_discovery";

      if (shouldRunOrchestration) {
        const agentRunInput = buildSelectedMarkAgentRunInput(
          intentRequest,
          intentResolutionInput,
        );
        let orchestrationResult: SelectedMarkOrchestrationResult | undefined;
        const runner = createLambdaAgentRunner({
          runSelectedMarkExplanation: async (input) => {
            orchestrationResult =
              await runSelectedMarkExplanationOrchestration(input);
            return orchestrationResult;
          },
        });
        const agentRunResult = await runner.run(agentRunInput);
        if (!orchestrationResult) {
          orchestrationResult = buildSelectedMarkFallbackOrchestrationResult(
            intentResolutionInput,
            intentRequest,
            agentRunInput,
            agentRunResult,
          );
        }
        const response: ResolveIntentResponse = {
          result: {
            ...orchestrationResult.intentResolution,
            traceMetadata: {
              ...(orchestrationResult.intentResolution.traceMetadata ?? {}),
              ...(agentRunResult.runner
                ? {
                    runner: {
                      kind: agentRunResult.runner.kind,
                      name: agentRunResult.runner.name ?? null,
                      version: agentRunResult.runner.version ?? null,
                      implementation:
                        agentRunResult.runner.implementation ?? null,
                    },
                  }
                : {}),
              ...(agentRunResult.observability
                ? {
                    observability: {
                      startedAt: agentRunResult.observability.startedAt ?? null,
                      completedAt:
                        agentRunResult.observability.completedAt ?? null,
                      durationMs:
                        agentRunResult.observability.durationMs ?? null,
                      traceId: agentRunResult.observability.traceId ?? null,
                      correlationId:
                        agentRunResult.observability.correlationId ?? null,
                    },
                  }
                : {}),
              agentRun: {
                status: agentRunResult.status,
                fallbackReason: agentRunResult.fallbackReason ?? null,
                finalMessage: agentRunResult.finalMessage ?? null,
                traceSummary: agentRunResult.traceSummary ?? null,
                budgetUsage: agentRunResult.budgetUsage ?? null,
              },
            },
          },
          orchestration: {
            ...orchestrationResult,
            status:
              agentRunResult.status === "failed" ||
              agentRunResult.status === "timed_out"
                ? "failed"
                : orchestrationResult.status,
            message: agentRunResult.finalMessage ?? orchestrationResult.message,
            placeholderResponse:
              agentRunResult.response?.message ??
              orchestrationResult.placeholderResponse,
            traceEvents: agentRunResult.trace,
            traceMetadata: {
              ...(orchestrationResult.traceMetadata ?? {}),
              runner: agentRunResult.runner ?? null,
              observability: agentRunResult.observability ?? null,
              agentRun: {
                status: agentRunResult.status,
                fallbackReason: agentRunResult.fallbackReason ?? null,
                finalMessage: agentRunResult.finalMessage ?? null,
                traceSummary: agentRunResult.traceSummary ?? null,
                budgetUsage: agentRunResult.budgetUsage ?? null,
              },
            },
            responseMaterial:
              orchestrationResult.responseMaterial ??
              agentRunResult.response?.summary ??
              undefined,
          },
        };

        logInfo("chat.intent_orchestration.completed", {
          requestId,
          agentRunId: orchestrationResult.intentResolution.agentRunId,
          resolvedIntentId:
            orchestrationResult.intentResolution.resolvedIntentId,
          status: orchestrationResult.status,
          planId: orchestrationResult.planSelection?.selectedPlan.id,
          executionStatus: orchestrationResult.execution?.status,
          runnerKind: agentRunResult.runner?.kind,
          runnerStatus: agentRunResult.status,
        });
        return jsonResponse(200, response);
      }

      if (shouldRunMetadataDiscoveryOrchestration) {
        const metadataDiscoveryOrchestration =
          await runMetadataDiscoveryOrchestration({
            intentResolutionInput,
            executionContext: buildMetadataDiscoveryExecutionContext(
              intentRequest,
              authResult.user,
              requestId,
            ),
          });
        const response: ResolveIntentResponse = {
          result: metadataDiscoveryOrchestration.intentResolution,
          metadataDiscoveryOrchestration,
        };

        logInfo("chat.metadata_discovery_orchestration.completed", {
          requestId,
          agentRunId:
            metadataDiscoveryOrchestration.intentResolution.agentRunId,
          resolvedIntentId:
            metadataDiscoveryOrchestration.intentResolution.resolvedIntentId,
          status: metadataDiscoveryOrchestration.status,
          planState: metadataDiscoveryOrchestration.plan.planState,
          executionStatus:
            metadataDiscoveryOrchestration.execution?.status ?? null,
        });
        return jsonResponse(200, response);
      }

      const result = await resolver.resolve(intentResolutionInput);
      const response: ResolveIntentResponse = {
        result: {
          ...result,
          traceMetadata: {
            ...(result.traceMetadata ?? {}),
            orchestration: buildOrchestrationIntentResolutionTraceMetadata(
              result,
              {
                frontendActionId: intentRequest.actionId,
                contextSummary: buildOrchestrationContextSummary(
                  intentRequest.contextSummary,
                ),
              },
            ),
          },
        },
      };

      logInfo("chat.intent_request.completed", {
        requestId,
        agentRunId: result.agentRunId,
        resolvedIntentId: result.resolvedIntentId,
        status: result.status,
      });
      return jsonResponse(200, response);
    }

    const chatRequest = request as ChatRequest;
    const validationError = validateRequest(chatRequest);
    if (validationError) {
      logWarn("chat.request.invalid", { requestId, validationError });
      return jsonResponse(400, { message: validationError });
    }

    const response = await createChatService().generateAnswer(
      chatRequest,
      authResult.user,
      {
        getRemainingTimeInMillis: context?.getRemainingTimeInMillis,
      },
    );
    logInfo("chat.request.completed", {
      requestId,
      provider: response.debug?.tableauContextProvider,
      sessionId: response.sessionId,
      messageId: response.messageId,
    });
    return jsonResponse(200, response);
  } catch (error) {
    if (isChatJobRoute && method === "GET") {
      const jobRouteError = mapChatJobRouteError(error);
      if (jobRouteError) {
        logWarn("chat.job.request.rejected", {
          requestId,
          routePath,
          statusCode: jobRouteError.statusCode,
          ...safeErrorDetails(error),
        });
        return jsonResponse(jobRouteError.statusCode, {
          message: jobRouteError.message,
        });
      }
    }

    logError("chat.request.failed", { requestId, ...safeErrorDetails(error) });
    return jsonResponse(500, { message: "Failed to generate an answer." });
  }
}

function parseRequest(body: string | null | undefined): unknown {
  if (!body) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(body) as unknown;
}

function validateRequest(request: ChatRequest): string | null {
  if (!request.question?.trim()) {
    return "question is required.";
  }

  if (!request.dashboardContext) {
    return "dashboardContext is required.";
  }

  if (!Array.isArray(request.dashboardContext.worksheets)) {
    return "dashboardContext.worksheets must be an array.";
  }

  return null;
}

function validateContextRequest(request: ContextRequest): string | null {
  if (!request.dashboardContext) {
    return "dashboardContext is required.";
  }

  if (!Array.isArray(request.dashboardContext.worksheets)) {
    return "dashboardContext.worksheets must be an array.";
  }

  return null;
}

function validateResolveIntentRequest(
  request: ResolveIntentRequest,
): string | null {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return "request body must be an object.";
  }

  if (request.contextSummary?.worksheetNames) {
    if (!Array.isArray(request.contextSummary.worksheetNames)) {
      return "contextSummary.worksheetNames must be an array.";
    }
  }

  if (request.targetContext && !isJsonObject(request.targetContext)) {
    return "targetContext must be an object.";
  }

  return null;
}

function getRoutePath(event: ApiGatewayProxyEvent): string {
  return event.rawPath ?? event.path ?? "";
}

function jsonResponse(
  statusCode: number,
  payload: unknown,
): ApiGatewayProxyResult {
  const config = getConfig();
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": config.corsAllowedOrigin,
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-Auth-Poll-Token,X-Chat-Owner-Token",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      "Content-Type": "application/json",
    },
    body: statusCode === 204 ? "" : JSON.stringify(payload),
  };
}

function parseJobId(routePath: string): string | null {
  const prefix = "/chat-jobs/";
  if (!routePath.startsWith(prefix)) {
    return null;
  }

  const jobId = routePath.slice(prefix.length).trim();
  return jobId || null;
}

function buildIntentResolutionInput(
  request: ResolveIntentRequest,
): IntentResolutionInput {
  return {
    agentRunId: createAgentRunId(),
    message: request.message,
    frontendActionId: request.actionId,
    requestedIntentId: request.requestedIntent as IntentId | undefined,
    contextSummary: request.contextSummary
      ? {
          dashboardName: request.contextSummary.dashboardName,
          workbookName: request.contextSummary.workbookName,
          viewName: request.contextSummary.viewName,
          worksheetNames: request.contextSummary.worksheetNames,
          selectedMarks: {
            hasSelectedMarks: request.contextSummary.hasSelectedMarks,
            totalCount: request.contextSummary.selectedMarkCount ?? 0,
            previewCount: request.contextSummary.selectedMarkCount ?? 0,
            truncated: false,
            worksheetNames: request.contextSummary.worksheetNames,
          },
          ...(request.contextSummary.summaryDataPreview
            ? {
                summaryDataPreview: {
                  available:
                    request.contextSummary.summaryDataPreview.available,
                  rowCount: request.contextSummary.summaryDataPreview.rowCount,
                  columnCount:
                    request.contextSummary.summaryDataPreview.columnCount,
                  columnNames:
                    request.contextSummary.summaryDataPreview.columnNames,
                  truncated:
                    request.contextSummary.summaryDataPreview.truncated,
                },
              }
            : {}),
          ...(request.contextSummary.filters
            ? {
                filters: {
                  count: request.contextSummary.filters.count,
                  names: request.contextSummary.filters.names,
                },
              }
            : {}),
          ...(request.contextSummary.parameters
            ? {
                parameters: {
                  count: request.contextSummary.parameters.count,
                  names: request.contextSummary.parameters.names,
                },
              }
            : {}),
        }
      : undefined,
    resolverMode: "deterministic",
    traceMetadata: {
      clientTimestamp: request.clientTimestamp ?? null,
      actionId: request.actionId ?? null,
    },
    metadata: request.metadata
      ? ({ ...request.metadata } as JsonObject)
      : undefined,
    targetContext: request.targetContext
      ? ({ ...request.targetContext } as JsonObject)
      : undefined,
  };
}

function buildMetadataDiscoveryExecutionContext(
  request: ResolveIntentRequest,
  authenticatedUser?: AuthenticatedUser,
  requestId?: string,
): NonNullable<
  Parameters<typeof runMetadataDiscoveryOrchestration>[0]["executionContext"]
> {
  return {
    authenticatedUser,
    tableauMetadataTransportKind:
      typeof request.metadata?.tableauMetadataTransportKind === "string"
        ? (request.metadata.tableauMetadataTransportKind as
            | "stdio"
            | "hosted"
            | "remote"
            | "fake"
            | "unknown")
        : "fake",
    tableauMetadataHostedExecutionEnabled:
      request.metadata?.tableauMetadataHostedExecutionEnabled === true,
    tableauMetadataNoNetwork:
      request.metadata?.tableauMetadataNoNetwork !== false,
    tableauMetadataRequestContext: {
      requestId: requestId ?? request.actionId ?? "metadata-discovery-request",
      correlationId:
        request.clientTimestamp ??
        request.actionId ??
        requestId ??
        "metadata-discovery-request",
      agentRunId: requestId ?? request.actionId ?? "metadata-discovery-request",
      locale:
        typeof request.metadata?.locale === "string"
          ? request.metadata.locale
          : "en-US",
    },
    tableauMetadataPreconditionInput: request.metadata
      ?.tableauMetadataPreconditionInput as
      | NonNullable<
          Parameters<
            typeof runMetadataDiscoveryOrchestration
          >[0]["executionContext"]
        >["tableauMetadataPreconditionInput"]
      | undefined,
  };
}

function buildSelectedMarkAgentRunInput(
  request: ResolveIntentRequest,
  intentResolutionInput: IntentResolutionInput,
): AgentRunInput {
  const selectedMarkLegacyIntent = buildSelectedMarkLegacyIntent(request);
  const selectedMarkLegacyPlan = buildSelectedMarkLegacyPlan(
    intentResolutionInput.agentRunId,
    selectedMarkLegacyIntent,
  );
  return {
    agentRunId: intentResolutionInput.agentRunId,
    userMessage: request.message ?? "Explain the selected marks.",
    contextPack: buildSelectedMarkLegacyContextPack(
      request,
      intentResolutionInput.agentRunId,
    ),
    trace: [] as TraceEvent[],
    intent: selectedMarkLegacyIntent,
    plan: selectedMarkLegacyPlan,
    runMode: "selected_mark_explanation",
    requestedIntent: "selected_mark_explanation",
    actionId: request.actionId,
    context: buildSelectedMarkAgentRunContextSummary(request.contextSummary),
    planHint: {
      planId: "selected_mark_explanation-v1",
      planName: "Selected mark explanation fixed plan",
      fixed: true,
      reason: "Explicit selected-mark action path.",
    },
    toolPolicy: {
      allowedTools: [
        "context.selectedMarks",
        "context.summaryDataPreview",
        "context.filters",
        "context.parameters",
      ],
      safeForPreviewOnly: true,
      requiresExplicitActionAllowed: false,
    },
    modelPolicy: {
      provider: "none",
      modelId: "none",
      maxModelCalls: 0,
      allowLlmGeneration: false,
    },
    budget: {
      maxModelCalls: 0,
      maxToolCalls: 4,
      timeoutMs: 15_000,
      maxDurationMs: 20_000,
      maxEstimatedCostUsd: 0,
    },
    traceOptions: {
      traceId: intentResolutionInput.agentRunId,
      correlationId:
        request.clientTimestamp ??
        request.actionId ??
        intentResolutionInput.agentRunId,
      captureEvents: true,
      captureSummary: true,
      includeMetadata: true,
      metadata: {
        actionId: request.actionId ?? null,
        clientTimestamp: request.clientTimestamp ?? null,
      },
    },
    locale:
      request.metadata && typeof request.metadata.locale === "string"
        ? request.metadata.locale
        : "en",
    metadata: request.metadata
      ? ({ ...request.metadata } as JsonObject)
      : undefined,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildSelectedMarkAgentRunContextSummary(
  contextSummary: ResolveIntentRequest["contextSummary"],
): AgentRunInput["context"] {
  if (!contextSummary) {
    return undefined;
  }

  return {
    dashboardName: contextSummary.dashboardName,
    workbookName: contextSummary.workbookName,
    viewName: contextSummary.viewName,
    worksheetNames: contextSummary.worksheetNames,
    selectedMarks: {
      available: Boolean(
        contextSummary.hasSelectedMarks ??
        (contextSummary.selectedMarkCount ?? 0) > 0,
      ),
      count: contextSummary.selectedMarkCount ?? 0,
      worksheetNames: contextSummary.worksheetNames,
      fieldNames: [],
      summary:
        contextSummary.hasSelectedMarks &&
        (contextSummary.selectedMarkCount ?? 0) > 0
          ? `Selected ${contextSummary.selectedMarkCount} mark(s).`
          : "No selected marks are available.",
      truncated: false,
    },
    summaryDataPreview: contextSummary.summaryDataPreview
      ? {
          available: contextSummary.summaryDataPreview.available ?? false,
          rowCount: contextSummary.summaryDataPreview.rowCount,
          columnCount: contextSummary.summaryDataPreview.columnCount,
          columnNames: contextSummary.summaryDataPreview.columnNames,
          truncated: contextSummary.summaryDataPreview.truncated,
        }
      : undefined,
    filters: contextSummary.filters
      ? {
          available: (contextSummary.filters.count ?? 0) > 0,
          count: contextSummary.filters.count,
          names: contextSummary.filters.names,
          truncated: false,
        }
      : undefined,
    parameters: contextSummary.parameters
      ? {
          available: (contextSummary.parameters.count ?? 0) > 0,
          count: contextSummary.parameters.count,
          names: contextSummary.parameters.names,
          truncated: false,
        }
      : undefined,
  };
}

function buildSelectedMarkLegacyIntent(
  request: ResolveIntentRequest,
): AgentIntent {
  return {
    name: "data_analysis",
    confidence: 0.99,
    reasonBrief:
      request.message ?? "Explicit selected-mark explanation request.",
    answerableFromContext: true,
    needsMcp: false,
    maxToolCalls: 4,
    normalizedQuestion: request.message ?? "Explain the selected marks.",
  };
}

function buildSelectedMarkLegacyPlan(
  agentRunId: AgentRunInput["agentRunId"],
  intent: AgentIntent,
): AgentPlan {
  return {
    agentRunId,
    intent,
    fixed: true,
    reasonBrief: "Explicit selected-mark action path.",
    requiredEvidence: [
      "selected_marks",
      "summary_data_preview",
      "filters",
      "parameters",
    ],
    steps: [
      {
        type: "inspect_context",
        description: "Inspect the selected marks context.",
      },
    ],
    maxToolCalls: 4,
  };
}

function buildSelectedMarkLegacyContextPack(
  request: ResolveIntentRequest,
  agentRunId: AgentRunInput["agentRunId"],
): ContextPack {
  const contextSummary = request.contextSummary;
  const selectedMarkCount = contextSummary?.selectedMarkCount ?? 0;
  const worksheetNames = contextSummary?.worksheetNames ?? [];

  return {
    agentRunId,
    createdAt: request.clientTimestamp ?? new Date().toISOString(),
    question: request.message ?? "Explain the selected marks.",
    dashboardContext: {
      dashboardName: contextSummary?.dashboardName ?? "Selected marks",
      workbookName: contextSummary?.workbookName ?? null,
      viewName: contextSummary?.viewName ?? null,
      worksheets: worksheetNames.map((name) => ({ name })),
      filters: (contextSummary?.filters?.names ?? []).map((fieldName) => ({
        fieldName,
      })),
      parameters: (contextSummary?.parameters?.names ?? []).map((name) => ({
        name,
      })),
      selectedMarks:
        selectedMarkCount > 0
          ? [
              {
                worksheetName: worksheetNames[0] ?? "Selected marks",
                columns: [],
                rowCount: selectedMarkCount,
                status: "available",
              },
            ]
          : [],
      capturedAt: request.clientTimestamp ?? new Date().toISOString(),
    },
  };
}

function buildSelectedMarkFallbackOrchestrationResult(
  intentResolutionInput: IntentResolutionInput,
  request: ResolveIntentRequest,
  agentRunInput: AgentRunInput,
  agentRunResult: AgentRunResult,
): SelectedMarkOrchestrationResult {
  const contextSummary = buildOrchestrationContextSummary(
    request.contextSummary,
  );
  const fallbackReason =
    agentRunResult.fallbackReason ??
    "LambdaAgentRunner returned a fallback selected-mark result.";
  const resultStatus =
    agentRunResult.status === "failed" || agentRunResult.status === "timed_out"
      ? "failed"
      : "fallback";
  const selectedMarkCount = request.contextSummary?.selectedMarkCount ?? 0;

  return {
    mode: "resolve_and_execute_fixed_plan",
    status: resultStatus,
    message:
      agentRunResult.finalMessage ??
      fallbackReason ??
      "Selected-mark orchestration failed.",
    placeholderResponse:
      agentRunResult.response?.message ??
      agentRunResult.finalMessage ??
      "Selected-mark orchestration failed.",
    intentResolution: {
      agentRunId: intentResolutionInput.agentRunId,
      status: "resolved",
      resolvedIntentId: "selected_mark_explanation",
      confidence: 0.99,
      source: "ui_action",
      reason:
        request.message ??
        "Explicit selected-mark explanation request routed through LambdaAgentRunner.",
      warnings: agentRunResult.warnings.map((warning) => warning.message),
      evidence: [],
      traceMetadata: {
        ...(intentResolutionInput.traceMetadata ?? {}),
        agentRun: {
          status: agentRunResult.status,
          fallbackReason: fallbackReason ?? null,
          finalMessage: agentRunResult.finalMessage ?? null,
          budgetUsage: agentRunResult.budgetUsage ?? null,
        },
      },
      metadata: {
        ...(intentResolutionInput.metadata ?? {}),
        runnerKind: agentRunResult.runner?.kind ?? null,
        selectedMarkCount,
      },
    },
    traceEvents: agentRunResult.trace,
    traceMetadata: {
      runner: agentRunResult.runner ?? null,
      observability: agentRunResult.observability ?? null,
      agentRun: {
        status: agentRunResult.status,
        fallbackReason: fallbackReason ?? null,
        finalMessage: agentRunResult.finalMessage ?? null,
        traceSummary: agentRunResult.traceSummary ?? null,
        budgetUsage: agentRunResult.budgetUsage ?? null,
      },
      ...(agentRunInput.traceOptions?.metadata
        ? { traceOptions: agentRunInput.traceOptions.metadata }
        : {}),
    },
    contextSummary,
  };
}

function buildOrchestrationContextSummary(
  contextSummary: ResolveIntentRequest["contextSummary"],
): OrchestrationTraceContextSummary | undefined {
  if (!contextSummary) {
    return undefined;
  }

  return {
    dashboardName: contextSummary.dashboardName,
    workbookName: contextSummary.workbookName,
    viewName: contextSummary.viewName,
    worksheetNames: contextSummary.worksheetNames,
    selectedMarks: {
      hasSelectedMarks: contextSummary.hasSelectedMarks,
      totalCount: contextSummary.selectedMarkCount,
      previewCount: contextSummary.selectedMarkCount,
      truncated: false,
      worksheetNames: contextSummary.worksheetNames,
    },
    ...(contextSummary.summaryDataPreview
      ? {
          summaryDataPreview: {
            available: contextSummary.summaryDataPreview.available,
            rowCount: contextSummary.summaryDataPreview.rowCount,
            columnCount: contextSummary.summaryDataPreview.columnCount,
            columnNames: contextSummary.summaryDataPreview.columnNames,
            truncated: contextSummary.summaryDataPreview.truncated,
          },
        }
      : {}),
    ...(contextSummary.filters
      ? {
          filters: {
            count: contextSummary.filters.count,
            names: contextSummary.filters.names,
          },
        }
      : {}),
    ...(contextSummary.parameters
      ? {
          parameters: {
            count: contextSummary.parameters.count,
            names: contextSummary.parameters.names,
          },
        }
      : {}),
  };
}

function mapChatJobRouteError(
  error: unknown,
): { statusCode: number; message: string } | null {
  const message = error instanceof Error ? error.message : "";

  if (/not found/i.test(message)) {
    return {
      statusCode: 404,
      message: "Chat job not found.",
    };
  }

  if (/access|unauthorized|forbidden/i.test(message)) {
    return {
      statusCode: 403,
      message: "You do not have access to this chat job.",
    };
  }

  return null;
}
