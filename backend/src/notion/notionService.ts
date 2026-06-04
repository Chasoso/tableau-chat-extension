import { getConfig } from "../config";
import { logDebug } from "../logging";
import {
  getDefaultNotionConnectionId,
  NotionRepository,
} from "../repositories/notionRepository";
import type { AuthenticatedUser } from "../types/auth";
import type {
  CreateNotionPostIdeaRequest,
  NotionPostIdeaSaveResponse,
  NotionStatusResponse,
} from "../types/notion";
import { categorizeNotionMcpError, NotionMcpClient } from "./notionMcpClient";
import { NotionOAuthService } from "./notionOAuthService";

export class NotionService {
  constructor(
    private readonly repository = new NotionRepository(),
    private readonly oauthService = new NotionOAuthService(),
    private readonly notionMcpClient = new NotionMcpClient(),
  ) {}

  async getStatus(
    user: AuthenticatedUser | undefined,
  ): Promise<NotionStatusResponse> {
    const userId = resolveNotionUserId(user);
    const config = getConfig().notion;
    const connection = await this.repository.getConnection(
      userId,
      getDefaultNotionConnectionId(),
    );
    const effectiveTargetParentPageId =
      connection?.targetParentPageId ?? config.defaultTargetParentPageId;
    const effectiveTargetDatabaseId =
      connection?.targetDatabaseId ?? config.defaultTargetDatabaseId;

    return {
      connected: Boolean(connection?.status === "connected"),
      workspaceName: connection?.notionWorkspaceName,
      status: connection?.status ?? "disconnected",
      targetParentPageIdConfigured: Boolean(effectiveTargetParentPageId),
      targetDatabaseIdConfigured: Boolean(effectiveTargetDatabaseId),
    };
  }

  async connect(
    user: AuthenticatedUser | undefined,
    redirectAfter?: string,
  ): Promise<{ authorizationUrl: string }> {
    const userId = resolveNotionUserId(user);
    return this.oauthService.buildAuthorizationUrl({ userId, redirectAfter });
  }

  async callback(
    code?: string,
    state?: string,
  ): Promise<{ redirectTo: string }> {
    return this.oauthService.handleCallback({ code, state });
  }

  async disconnect(user: AuthenticatedUser | undefined): Promise<void> {
    const userId = resolveNotionUserId(user);
    await this.repository.deleteConnection(
      userId,
      getDefaultNotionConnectionId(),
    );
  }

  async updateSettings(
    user: AuthenticatedUser | undefined,
    input: { targetParentPageId?: string; targetDatabaseId?: string },
  ): Promise<void> {
    const userId = resolveNotionUserId(user);
    const connection = await this.repository.getConnection(
      userId,
      getDefaultNotionConnectionId(),
    );
    if (!connection) {
      throw new Error("Notion is not connected.");
    }

    await this.repository.putConnection({
      ...connection,
      targetParentPageId:
        input.targetParentPageId ?? connection.targetParentPageId,
      targetDatabaseId: input.targetDatabaseId ?? connection.targetDatabaseId,
      updatedAt: new Date().toISOString(),
    });
  }

  async createPostIdea(
    user: AuthenticatedUser | undefined,
    payload: CreateNotionPostIdeaRequest,
  ): Promise<NotionPostIdeaSaveResponse> {
    const userId = resolveNotionUserId(user);
    const { connection, accessToken } =
      await this.oauthService.getConnectionForUse(userId);
    const config = getConfig().notion;
    const targetParentPageId =
      connection.targetParentPageId ?? config.defaultTargetParentPageId;
    const targetDatabaseId =
      connection.targetDatabaseId ?? config.defaultTargetDatabaseId;
    if (!targetParentPageId && !targetDatabaseId) {
      throw new Error("Notion target is not configured.");
    }
    logDebug("notion.create_post_idea.started", {
      userIdPresent: Boolean(userId),
      hasTargetParentPageId: Boolean(targetParentPageId),
      hasTargetDatabaseId: Boolean(targetDatabaseId),
    });

    const markdownBody = buildPostIdeaMarkdown(payload);
    let created;
    try {
      try {
        created = await this.notionMcpClient.createPostIdeaPage({
          accessToken,
          title: payload.title,
          markdownBody,
          targetParentPageId,
          targetDatabaseId,
        });
      } catch (error) {
        if (!isInvalidTokenError(error)) {
          throw error;
        }

        logDebug("notion.create_post_idea.retry_after_token_refresh", {
          userIdPresent: Boolean(userId),
        });
        const refreshed = await this.oauthService.getConnectionForUse(userId, {
          forceRefresh: true,
        });
        created = await this.notionMcpClient.createPostIdeaPage({
          accessToken: refreshed.accessToken,
          title: payload.title,
          markdownBody,
          targetParentPageId,
          targetDatabaseId,
        });
      }
    } catch (error) {
      if (categorizeNotionMcpError(error) === "invalid_token") {
        await this.repository.putConnection({
          ...connection,
          status: "refresh_failed",
          updatedAt: new Date().toISOString(),
        });
        throw new Error(
          "Notion access token is invalid after refresh. Please reconnect Notion.",
        );
      }
      throw error;
    }

    logDebug("notion.create_post_idea.completed", {
      userIdPresent: Boolean(userId),
      hasPageUrl: Boolean(created.pageUrl),
    });
    return {
      ok: true,
      pageUrl: created.pageUrl,
      pageTitle: payload.title,
    };
  }
}

function isInvalidTokenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid_token|Invalid access token|401|unauthorized/i.test(message);
}

function buildPostIdeaMarkdown(payload: CreateNotionPostIdeaRequest): string {
  const tags =
    payload.tags?.filter(Boolean).join(", ") || "Tableau, MCP, X Analytics";
  return [
    `# 投稿アイデア: ${payload.title}`,
    "",
    "## 概要",
    payload.reason,
    "",
    "## 推奨投稿文",
    payload.suggestedPostText,
    "",
    "## 根拠となる指標",
    `- Impressions: ${payload.metricSummary?.impressions ?? "n/a"}`,
    `- Engagement Rate: ${payload.metricSummary?.engagementRate ?? "n/a"}`,
    `- Bookmark Rate: ${payload.metricSummary?.bookmarkRate ?? "n/a"}`,
    `- Profile Visit Rate: ${payload.metricSummary?.profileVisitRate ?? "n/a"}`,
    "",
    "## 参照ポスト",
    payload.referencePostUrl || "n/a",
    "",
    "## Source",
    payload.source || "Generated from Tableau MCP analysis.",
    "",
    "## Tags",
    tags,
  ].join("\n");
}

export function resolveNotionUserId(
  user: AuthenticatedUser | undefined,
): string {
  const config = getConfig();
  if (user?.userId) {
    return user.userId;
  }

  if (!config.auth.required) {
    return config.notion.localDevUserId;
  }

  throw new Error("Authenticated user is required.");
}
