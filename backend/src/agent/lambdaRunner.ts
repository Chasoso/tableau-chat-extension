import type { AuthenticatedUser } from "../types/auth";
import type { ChatRequest, ChatResponse } from "../types/chat";
import type { ChatService } from "../services/chatService";
import { createTraceError, createTraceEvent } from "./trace";
import type { AgentRunInput, AgentRunResult, AgentRunner } from "./runner";
import type { JsonObject, TraceError, TraceEvent } from "./types";

type ChatServiceLike = Pick<ChatService, "generateAnswer">;

export class LambdaAgentRunner implements AgentRunner {
  constructor(private readonly chatService: ChatServiceLike) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    const trace: TraceEvent[] = [...input.trace];
    const request = toChatRequest(input);
    const authenticatedUser = toAuthenticatedUser(input.contextPack.user);
    const appendTrace = async (event: TraceEvent): Promise<void> => {
      trace.push(event);
      if (input.traceSink) {
        await input.traceSink.append(event);
      }
    };

    await appendTrace(
      createTraceEvent({
        agentRunId: input.agentRunId,
        type: "run_started",
        message: "LambdaAgentRunner started",
        runStatus: "running",
        metadata: {
          runner: "lambda",
        },
      }),
    );

    try {
      const response = await this.chatService.generateAnswer(
        request,
        authenticatedUser,
        buildChatServiceOptions(input.options?.budget?.timeoutMs, startedAtMs),
      );
      const endedAt = new Date().toISOString();

      await appendTrace(
        createTraceEvent({
          agentRunId: input.agentRunId,
          type: "run_completed",
          message: "LambdaAgentRunner completed",
          runStatus: "completed",
          metadata: {
            runner: "lambda",
            sessionId: response.sessionId,
            messageId: response.messageId,
            answerLength: response.answer.length,
          },
        }),
      );

      return {
        agentRunId: input.agentRunId,
        status: "completed",
        answer: response.answer,
        trace,
        warnings: [],
        startedAt,
        endedAt,
        metadata: buildResultMetadata(input, response),
      };
    } catch (error) {
      const endedAt = new Date().toISOString();
      const traceError = toTraceError(error);

      await appendTrace(
        createTraceEvent({
          agentRunId: input.agentRunId,
          type: "run_failed",
          message: "LambdaAgentRunner failed",
          runStatus: "failed",
          error: traceError,
          metadata: {
            runner: "lambda",
          },
        }),
      );

      return {
        agentRunId: input.agentRunId,
        status: "failed",
        trace,
        warnings: [],
        error: traceError,
        startedAt,
        endedAt,
        metadata: input.options?.metadata,
      };
    }
  }
}

export function createLambdaAgentRunner(
  chatService: ChatServiceLike,
): LambdaAgentRunner {
  return new LambdaAgentRunner(chatService);
}

function toChatRequest(input: AgentRunInput): ChatRequest {
  return {
    question: input.userMessage,
    dashboardContext: input.contextPack.dashboardContext,
    ...(input.contextPack.clientContext
      ? { clientContext: input.contextPack.clientContext }
      : {}),
    ...(input.contextPack.sessionId
      ? { sessionId: input.contextPack.sessionId }
      : {}),
  };
}

function toAuthenticatedUser(
  user: AgentRunInput["contextPack"]["user"],
): AuthenticatedUser | undefined {
  if (!user) {
    return undefined;
  }

  return {
    userId: user.userId,
    email: user.email,
    tableauSubject: user.tableauSubject,
    tokenUse: user.tokenUse,
  };
}

function buildChatServiceOptions(
  timeoutMs: number | undefined,
  startedAtMs: number,
): Parameters<ChatServiceLike["generateAnswer"]>[2] | undefined {
  if (timeoutMs === undefined) {
    return undefined;
  }

  return {
    getRemainingTimeInMillis: () =>
      Math.max(0, timeoutMs - (Date.now() - startedAtMs)),
  };
}

function buildResultMetadata(
  input: AgentRunInput,
  response: ChatResponse,
): JsonObject {
  const metadata: JsonObject = {
    sessionId: response.sessionId,
    messageId: response.messageId,
  };

  if (input.options?.metadata) {
    metadata.inputMetadata = input.options.metadata;
  }

  return metadata;
}

function toTraceError(error: unknown): TraceError {
  if (error instanceof Error) {
    return createTraceError({
      code: "CHAT_SERVICE_ERROR",
      message: error.message || "Chat service execution failed.",
      stack: error.stack,
      details: {
        runner: "lambda",
        originalErrorName: error.name || "Error",
      },
    });
  }

  return createTraceError({
    code: "CHAT_SERVICE_ERROR",
    message: "Chat service execution failed.",
    details: {
      runner: "lambda",
      errorType: typeof error,
    },
  });
}
