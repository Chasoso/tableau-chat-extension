export type ApiGatewayProxyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    http?: {
      method?: string;
    };
  };
  body?: string | null;
};

export type ApiGatewayProxyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};
