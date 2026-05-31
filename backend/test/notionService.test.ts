import { afterEach, describe, expect, it } from "vitest";
import { resolveNotionUserId } from "../src/notion/notionService";

describe("resolveNotionUserId", () => {
  const originalAuthRequired = process.env.AUTH_REQUIRED;
  const originalLocalDevUserId = process.env.NOTION_LOCAL_DEV_USER_ID;

  afterEach(() => {
    if (originalAuthRequired === undefined) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = originalAuthRequired;
    }

    if (originalLocalDevUserId === undefined) {
      delete process.env.NOTION_LOCAL_DEV_USER_ID;
    } else {
      process.env.NOTION_LOCAL_DEV_USER_ID = originalLocalDevUserId;
    }
  });

  it("returns cognito sub when authenticated user is present", () => {
    process.env.AUTH_REQUIRED = "true";
    const userId = resolveNotionUserId({
      userId: "sub-123",
      email: "test@example.com",
    });

    expect(userId).toBe("sub-123");
  });

  it("returns local dev user id when auth is disabled", () => {
    process.env.AUTH_REQUIRED = "false";
    process.env.NOTION_LOCAL_DEV_USER_ID = "local-dev-user";
    expect(resolveNotionUserId(undefined)).toBe("local-dev-user");
  });
});
