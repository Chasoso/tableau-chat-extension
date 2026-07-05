import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logging", () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  safeErrorDetails: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  safeHash: (value: string | undefined) => value ?? "anonymous",
}));

vi.mock("../src/agent/metadataDiscoveryOrchestration", () => ({
  runMetadataDiscoveryOrchestration: vi.fn(),
}));

import { runMetadataDiscoveryOrchestration } from "../src/agent/metadataDiscoveryOrchestration";
import { ChatService } from "../src/services/chatService";
import type { ChatHistoryRepository } from "../src/repositories/chatHistoryRepository";
import type { AnswerGenerator } from "../src/services/answerGenerator";
import type { TableauContextProvider } from "../src/tableau/contextProvider";
import { MockTableauContextProvider } from "../src/tableau/mockTableauContextProvider";
import type { ChatRequest } from "../src/types/chat";

const runMetadataDiscoveryOrchestrationMock = vi.mocked(
  runMetadataDiscoveryOrchestration,
);

describe("ChatService metadata discovery routing", () => {
  afterEach(() => {
    runMetadataDiscoveryOrchestrationMock.mockReset();
  });

  it("routes strong datasource metadata discovery requests through the structured path before legacy chat", async () => {
    runMetadataDiscoveryOrchestrationMock.mockResolvedValue({
      mode: "resolve_and_execute_metadata_discovery",
      status: "completed",
      message:
        "Structured metadata discovery completed through the safe describeDatasource boundary.",
      placeholderResponse:
        "Structured metadata discovery completed through the safe describeDatasource boundary.",
      intentResolution: {
        agentRunId: "ar_test" as never,
        status: "resolved",
        resolvedIntentId: "metadata_discovery",
        confidence: 0.99,
        source: "deterministic_rule",
        evidence: [],
        warnings: [],
      },
      decision: {
        agentRunId: "ar_test" as never,
        intentId: "metadata_discovery",
        kind: "execute_candidate",
        confidence: 0.99,
        targetTypeCandidate: "datasource",
        candidateTargetTypes: ["datasource"],
        ambiguityState: "ready",
        clarificationRequired: false,
        metadataBoundaryReady: true,
        nextStep: "structured_plan",
        reasonBrief: "safe datasource metadata discovery",
        safeUserFacingNote: "safe datasource metadata discovery",
        signals: ["datasource_keyword"],
        evidence: [],
        preconditions: [],
        missingPreconditions: [],
      } as never,
      plan: {
        kind: "metadata_discovery.plan",
        intentId: "metadata_discovery",
        planState: "executable",
        reasonCode: "safe_executable_datasource_candidate",
        reasonBrief: "safe datasource metadata discovery",
        safeMessage: "Loaded datasource metadata for Sales Datasource.",
        targetType: "datasource",
        targetIdentifier: "Sales Datasource",
        candidateTargetTypes: ["datasource"],
        ambiguityState: "ready",
        missingPreconditions: [],
        clarification: {
          requiresClarification: false,
          resumeFields: [],
          missingPreconditions: [],
          safetyNotes: [],
        },
        executionGate: {
          canExecute: true,
          safeToExecute: true,
          requiresHostedMcp: false,
          requiresNetwork: false,
          preconditions: [],
          safetyNotes: [],
        },
        unsupportedGate: {
          isUnsupported: false,
          fallbackRecommended: false,
          safetyNotes: [],
        },
        fallbackGate: {
          isFallback: false,
          safetyNotes: [],
        },
        metadataBoundary: {
          kind: "hosted_wrapper",
          toolName: "tableau.metadata.describeDatasource",
          operation: "describeDatasource",
          wrapperKind: "app_specific",
          safetyNotes: [],
        },
        executionCandidate: {
          appToolName: "tableau.metadata.describeDatasource",
          status: "ready",
          operation: "describeDatasource",
          targetType: "datasource",
          targetIdentifier: "Sales Datasource",
          wrapperKind: "app_specific",
          boundaryKind: "hosted_wrapper",
          requiresHostedMcp: false,
          requiresNetwork: false,
          safeToExecute: true,
          rawToolExposure: false,
          safetyNotes: [],
        },
        deferredToolCandidates: [],
        stateTransitions: [],
        safetyNotes: [],
        traceSafeSummary: {},
      } as never,
      responseMaterial: {},
      traceMetadata: {},
      execution: {
        toolName: "tableau.metadata.describeDatasource",
        status: "success",
        normalizedOutput: {
          toolName: "tableau.metadata.describeDatasource",
          status: "success",
          summary: {
            datasource: {
              datasourceName: "Sales Datasource",
              workbookName: "Sales Workbook",
              fieldCount: 12,
              visibleFieldCount: 10,
              hiddenFieldCount: 2,
            },
          },
        },
      },
    } as never);

    const contextProvider = createThrowingContextProvider();
    const answerGenerator = createAnswerGenerator();
    const repository = createRepository();
    const service = new ChatService(
      contextProvider,
      answerGenerator,
      repository,
    );

    const response = await service.generateAnswer(buildDatasourceRequest());

    expect(runMetadataDiscoveryOrchestrationMock).toHaveBeenCalledTimes(1);
    expect(answerGenerator.generate).not.toHaveBeenCalled();
    expect(contextProvider.getAdditionalContext).not.toHaveBeenCalled();
    expect(response.answer).toContain("データソース概要");
    expect(response.answer).toContain("Sales Datasource");
    expect(response.answer).toContain(
      "Structured metadata discovery completed through the safe describeDatasource boundary.",
    );
  });

  it("keeps generic chat questions on the legacy path", async () => {
    const contextProvider = createLegacyContextProvider();
    const answerGenerator = createAnswerGenerator("legacy answer");
    const repository = createRepository();
    const service = new ChatService(
      contextProvider,
      answerGenerator,
      repository,
    );

    const response = await service.generateAnswer(buildGenericRequest());

    expect(runMetadataDiscoveryOrchestrationMock).not.toHaveBeenCalled();
    expect(answerGenerator.generate).toHaveBeenCalledTimes(1);
    expect(response.answer).toContain("legacy answer");
  });

  it("does not steal selected_mark_explanation requests", async () => {
    const contextProvider = createLegacyContextProvider();
    const answerGenerator = createAnswerGenerator("selected mark legacy");
    const repository = createRepository();
    const service = new ChatService(
      contextProvider,
      answerGenerator,
      repository,
    );

    const response = await service.generateAnswer(buildSelectedMarkRequest());

    expect(runMetadataDiscoveryOrchestrationMock).not.toHaveBeenCalled();
    expect(answerGenerator.generate).toHaveBeenCalledTimes(1);
    expect(response.answer).toContain("selected mark legacy");
  });
});

function createAnswerGenerator(answer = "legacy answer"): AnswerGenerator {
  return {
    name: "mock",
    generate: vi.fn(async () => answer),
  };
}

function createThrowingContextProvider(): TableauContextProvider {
  return {
    name: "mock",
    getAdditionalContext: vi.fn(async () => {
      throw new Error("context provider should not be used");
    }) as TableauContextProvider["getAdditionalContext"],
  };
}

function createLegacyContextProvider(): TableauContextProvider {
  return new MockTableauContextProvider();
}

function createRepository(): ChatHistoryRepository {
  return {
    async save() {},
    async listRecentBySession() {
      return [];
    },
  };
}

function buildDatasourceRequest(): ChatRequest {
  return {
    question: "Tell me about this datasource.",
    dashboardContext: {
      dashboardName: "Overview",
      workbookName: "Sales Workbook",
      worksheets: [],
      filters: [],
      parameters: [],
      dataSources: [{ name: "Sales Datasource" }],
      capturedAt: "2026-07-05T00:00:00.000Z",
    },
  };
}

function buildGenericRequest(): ChatRequest {
  return {
    question: "What is this dashboard?",
    dashboardContext: {
      dashboardName: "Overview",
      workbookName: "Sales Workbook",
      worksheets: [],
      filters: [],
      parameters: [],
      capturedAt: "2026-07-05T00:00:00.000Z",
    },
  };
}

function buildSelectedMarkRequest(): ChatRequest {
  return {
    question: "Explain the selected marks.",
    dashboardContext: {
      dashboardName: "Overview",
      workbookName: "Sales Workbook",
      worksheets: [],
      filters: [],
      parameters: [],
      capturedAt: "2026-07-05T00:00:00.000Z",
    },
  };
}
