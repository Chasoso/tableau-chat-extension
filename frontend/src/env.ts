export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001",
  useMockTableau: import.meta.env.VITE_USE_MOCK_TABLEAU === "true",
  appVersion: "0.1.0",
};

