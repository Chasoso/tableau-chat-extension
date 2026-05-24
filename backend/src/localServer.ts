import { createServer } from "node:http";
import { handler as chatHandler } from "./handlers/chatHandler";
import { handler as healthHandler } from "./handlers/healthHandler";
import type { ApiGatewayProxyEvent } from "./types/api";

const port = Number(process.env.PORT ?? 3001);

const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];

  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  request.on("end", async () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const event: ApiGatewayProxyEvent = {
      httpMethod: request.method,
      headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)])),
      body: body || null,
    };

    const result =
      request.url?.startsWith("/health")
        ? await healthHandler()
        : request.url?.startsWith("/chat")
          ? await chatHandler(event)
          : {
              statusCode: 404,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: "Not found" }),
            };

    response.writeHead(result.statusCode, result.headers);
    response.end(result.body);
  });
});

server.listen(port, () => {
  console.log(`Local backend listening on http://localhost:${port}`);
});

