import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getConfig } from "../config";
import { logDebug, logWarn, safeErrorDetails } from "../logging";

type McpTool = {
  name: string;
  description?: string;
};

export class NotionMcpClient {
  async createPostIdeaPage(input: {
    accessToken: string;
    title: string;
    markdownBody: string;
    targetParentPageId?: string;
    targetDatabaseId?: string;
  }): Promise<{ pageUrl?: string; pageId?: string }> {
    const config = getConfig().notion;
    const mcpUrl = config.mcpUrl;
    if (!mcpUrl) {
      throw new Error("NOTION_MCP_URL is required.");
    }

    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
      },
    });
    const client = new Client({
      name: "tableau-chat-extension-notion-client",
      version: "0.1.0",
    });

    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools as McpTool[];
      const allowedTools = resolveAllowedNotionTools(config.allowedTools, tools.map((tool) => tool.name));
      if (!allowedTools.has("notion-create-pages")) {
        throw new Error("notion-create-pages is not allowed by NOTION_MCP_ALLOWED_TOOLS.");
      }

      const args = buildCreatePagesArgs(input);
      logDebug("notion.mcp.create_pages.requested", {
        allowedToolCount: allowedTools.size,
        hasTargetParentPageId: Boolean(input.targetParentPageId),
        hasTargetDatabaseId: Boolean(input.targetDatabaseId),
      });
      const result = await client.callTool({
        name: "notion-create-pages",
        arguments: args,
      });

      return extractNotionPageRef(result);
    } catch (error) {
      logWarn("notion.mcp.create_pages.failed", safeErrorDetails(error));
      throw error;
    } finally {
      await transport.close().catch(() => undefined);
    }
  }
}

function resolveAllowedNotionTools(configuredTools: string[], discoveredToolNames: string[]): Set<string> {
  const configured = configuredTools.map((toolName) => toolName.trim()).filter(Boolean);
  if (!configured.length) {
    return new Set(discoveredToolNames);
  }

  const discovered = new Set(discoveredToolNames);
  return new Set(configured.filter((toolName) => discovered.has(toolName)));
}

function buildCreatePagesArgs(input: {
  title: string;
  markdownBody: string;
  targetParentPageId?: string;
  targetDatabaseId?: string;
}): Record<string, unknown> {
  const parent = input.targetDatabaseId
    ? { data_source_id: input.targetDatabaseId, type: "data_source_id" }
    : input.targetParentPageId
      ? { page_id: input.targetParentPageId, type: "page_id" }
      : undefined;
  if (!parent) {
    throw new Error("Notion target is not configured. Set targetParentPageId or targetDatabaseId.");
  }

  return {
    parent,
    pages: [
      {
        properties: {
          title: input.title,
        },
        content: input.markdownBody,
      },
    ],
  };
}

function extractNotionPageRef(result: unknown): { pageUrl?: string; pageId?: string } {
  if (!result || typeof result !== "object") {
    return {};
  }

  const text = JSON.stringify(result);
  const notionUrl = text.match(/https:\/\/www\.notion\.so\/[^\s"']+/)?.[0];
  const pageId = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  return {
    pageUrl: notionUrl,
    pageId,
  };
}
