import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handler } from "../src/handlers/chatHandler";

describe("chatHandler", () => {
  const originalAuthRequired = process.env.AUTH_REQUIRED;

  beforeEach(() => {
    delete process.env.AUTH_REQUIRED;
  });

  afterEach(() => {
    if (originalAuthRequired === undefined) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = originalAuthRequired;
    }
  });

  it("returns 400 when question is empty", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        question: "",
        dashboardContext: {
          dashboardName: "Dashboard",
          worksheets: [],
          filters: [],
          parameters: [],
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe("question is required.");
  });

  it("returns 401 when auth is required and authorization header is missing", async () => {
    process.env.AUTH_REQUIRED = "true";

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        question: "What is this dashboard?",
        dashboardContext: {
          dashboardName: "Dashboard",
          worksheets: [],
          filters: [],
          parameters: [],
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).message).toBe("Authentication is required.");
  });
});
