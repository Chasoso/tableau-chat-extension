import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getConfig } from "../config";
import { logInfo, logWarn, safeErrorDetails, safeHash } from "../logging";
import type { NotionConnectionRecord, NotionOAuthStateRecord } from "../types/notion";
import { getDefaultNotionConnectionId, NotionRepository } from "../repositories/notionRepository";
import { decryptToken, encryptToken } from "./notionTokenCrypto";

type NotionTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  workspace_id?: string;
  workspace_name?: string;
  bot_id?: string;
  owner?: {
    type?: string;
    user?: {
      id?: string;
    };
  };
  duplicated_template_id?: string;
};

export class NotionOAuthService {
  constructor(private readonly repository = new NotionRepository()) {}

  async buildAuthorizationUrl(input: {
    userId: string;
    redirectAfter?: string;
  }): Promise<{ authorizationUrl: string }> {
    const config = getConfig();
    validateOauthConfiguration();

    const codeVerifier = createCodeVerifier();
    const state = randomUUID();
    const createdAt = new Date();
    const expiresAtEpoch = Math.floor((createdAt.getTime() + config.notion.oauthStateTtlSeconds * 1000) / 1000);
    const stateRecord: NotionOAuthStateRecord = {
      state,
      userId: input.userId,
      codeVerifier,
      redirectAfter: input.redirectAfter,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAtEpoch,
    };
    await this.repository.putOAuthState(stateRecord);
    logInfo("notion.oauth.connect.started", {
      userHash: safeHash(input.userId),
      stateHash: safeHash(state),
      ttlSeconds: config.notion.oauthStateTtlSeconds,
      hasRedirectAfter: Boolean(input.redirectAfter),
    });

    const codeChallenge = createCodeChallenge(codeVerifier);
    const authorizeUrl = new URL(config.notion.oauthAuthorizeUrl);
    authorizeUrl.searchParams.set("owner", "user");
    authorizeUrl.searchParams.set("client_id", config.notion.oauthClientId!);
    authorizeUrl.searchParams.set("redirect_uri", config.notion.redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    // Request an access token audience scoped to Notion MCP resource.
    authorizeUrl.searchParams.set("resource", config.notion.mcpUrl);

    return { authorizationUrl: authorizeUrl.toString() };
  }

  async handleCallback(input: { code?: string; state?: string }): Promise<{ redirectTo: string }> {
    const config = getConfig();
    validateOauthConfiguration();
    if (!input.code || !input.state) {
      throw new Error("Missing OAuth callback parameters.");
    }

    const stateRecord = await this.repository.getOAuthState(input.state);
    if (!stateRecord) {
      throw new Error("OAuth state not found or already used.");
    }
    logInfo("notion.oauth.callback.state_loaded", {
      stateHash: safeHash(input.state),
      userHash: safeHash(stateRecord.userId),
      hasRedirectAfter: Boolean(stateRecord.redirectAfter),
    });

    try {
      const nowEpoch = Math.floor(Date.now() / 1000);
      if (stateRecord.expiresAt < nowEpoch) {
        throw new Error("OAuth state expired.");
      }

      const tokenData = await exchangeAuthorizationCode({
        code: input.code,
        codeVerifier: stateRecord.codeVerifier,
      });
      logInfo("notion.oauth.callback.token_exchanged", {
        stateHash: safeHash(input.state),
        hasRefreshToken: Boolean(tokenData.refresh_token),
        hasWorkspaceId: Boolean(tokenData.workspace_id),
      });

      const accessEncrypted = await encryptToken(tokenData.access_token);
      const refreshEncrypted = tokenData.refresh_token ? await encryptToken(tokenData.refresh_token) : undefined;
      const nowIso = new Date().toISOString();
      const connection: NotionConnectionRecord = {
        userId: stateRecord.userId,
        connectionId: getDefaultNotionConnectionId(),
        notionWorkspaceId: tokenData.workspace_id,
        notionWorkspaceName: tokenData.workspace_name,
        notionBotId: tokenData.bot_id,
        notionUserId: tokenData.owner?.user?.id,
        accessTokenCiphertext: accessEncrypted.ciphertext,
        accessTokenIv: accessEncrypted.iv,
        accessTokenAuthTag: accessEncrypted.authTag,
        refreshTokenCiphertext: refreshEncrypted?.ciphertext,
        refreshTokenIv: refreshEncrypted?.iv,
        refreshTokenAuthTag: refreshEncrypted?.authTag,
        expiresAt: tokenData.expires_in ? Math.floor(Date.now() / 1000) + tokenData.expires_in : undefined,
        scopes: [],
        targetParentPageId: config.notion.defaultTargetParentPageId,
        targetDatabaseId: config.notion.defaultTargetDatabaseId,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastUsedAt: nowIso,
        status: "connected",
      };
      await this.repository.putConnection(connection);
      logInfo("notion.oauth.callback.connection_saved", {
        userHash: safeHash(stateRecord.userId),
        workspaceHash: safeHash(tokenData.workspace_name),
      });
    } finally {
      await this.repository.deleteOAuthState(input.state).catch((error) => {
        logWarn("notion.oauth_state.cleanup_failed", safeErrorDetails(error));
      });
    }

    return { redirectTo: stateRecord.redirectAfter || "/" };
  }

  async getConnectionForUse(
    userId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<{ connection: NotionConnectionRecord; accessToken: string }> {
    const record = await this.repository.getConnection(userId);
    if (!record || record.status !== "connected") {
      throw new Error("Notion is not connected.");
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const needsRefresh = Boolean(options?.forceRefresh || (record.expiresAt && record.expiresAt - nowEpoch <= 30));
    if (!needsRefresh) {
      return {
        connection: record,
        accessToken: await decryptToken({
          ciphertext: record.accessTokenCiphertext,
          iv: record.accessTokenIv,
          authTag: record.accessTokenAuthTag,
        }),
      };
    }

    if (!record.refreshTokenCiphertext || !record.refreshTokenIv || !record.refreshTokenAuthTag) {
      await this.repository.putConnection({
        ...record,
        status: "refresh_failed",
        updatedAt: new Date().toISOString(),
      });
      throw new Error("Notion token refresh is required but refresh token is unavailable.");
    }

    const decryptedRefreshToken = await decryptToken({
      ciphertext: record.refreshTokenCiphertext,
      iv: record.refreshTokenIv,
      authTag: record.refreshTokenAuthTag,
    });

    try {
      const refreshed = await refreshNotionToken(decryptedRefreshToken);
      const encryptedAccess = await encryptToken(refreshed.access_token);
      const encryptedRefresh = refreshed.refresh_token ? await encryptToken(refreshed.refresh_token) : undefined;
      const nowIso = new Date().toISOString();
      const updated: NotionConnectionRecord = {
        ...record,
        accessTokenCiphertext: encryptedAccess.ciphertext,
        accessTokenIv: encryptedAccess.iv,
        accessTokenAuthTag: encryptedAccess.authTag,
        refreshTokenCiphertext: encryptedRefresh?.ciphertext ?? record.refreshTokenCiphertext,
        refreshTokenIv: encryptedRefresh?.iv ?? record.refreshTokenIv,
        refreshTokenAuthTag: encryptedRefresh?.authTag ?? record.refreshTokenAuthTag,
        expiresAt: refreshed.expires_in ? Math.floor(Date.now() / 1000) + refreshed.expires_in : record.expiresAt,
        status: "connected",
        updatedAt: nowIso,
        lastUsedAt: nowIso,
      };
      await this.repository.putConnection(updated);
      return {
        connection: updated,
        accessToken: refreshed.access_token,
      };
    } catch (error) {
      await this.repository.putConnection({
        ...record,
        status: "refresh_failed",
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}

function validateOauthConfiguration(): void {
  const config = getConfig().notion;
  if (!config.enabled) {
    throw new Error("Notion MCP integration is disabled.");
  }

  if (!config.redirectUri || !config.oauthClientId || !config.oauthClientSecret) {
    throw new Error(
      "NOTION_REDIRECT_URI, NOTION_OAUTH_CLIENT_ID, and NOTION_OAUTH_CLIENT_SECRET are required for Notion OAuth.",
    );
  }
}

async function exchangeAuthorizationCode(input: { code: string; codeVerifier: string }): Promise<NotionTokenResponse> {
  const config = getConfig().notion;
  const response = await fetch(config.oauthTokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.oauthClientId}:${config.oauthClientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri,
      code_verifier: input.codeVerifier,
      resource: config.mcpUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion OAuth token exchange failed with status ${response.status}.`);
  }

  return (await response.json()) as NotionTokenResponse;
}

async function refreshNotionToken(refreshToken: string): Promise<NotionTokenResponse> {
  const config = getConfig().notion;
  const response = await fetch(config.oauthTokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.oauthClientId}:${config.oauthClientSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      resource: config.mcpUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion OAuth refresh failed with status ${response.status}.`);
  }

  return (await response.json()) as NotionTokenResponse;
}

function createCodeVerifier(): string {
  return toBase64Url(randomBytes(64));
}

function createCodeChallenge(codeVerifier: string): string {
  return toBase64Url(createHash("sha256").update(codeVerifier).digest());
}

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
