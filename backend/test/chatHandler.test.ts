import { describe, expect, it } from "vitest";
import { handler } from "../src/handlers/chatHandler";

describe("chatHandler", () => {
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
});

