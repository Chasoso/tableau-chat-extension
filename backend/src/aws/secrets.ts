import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export type TableauConnectedAppSecrets = {
  clientId: string;
  secretId: string;
  secretValue: string;
};

export async function getTableauConnectedAppSecretsFromEnv(): Promise<TableauConnectedAppSecrets> {
  const clientId = process.env.TABLEAU_CONNECTED_APP_CLIENT_ID;
  const secretId = process.env.TABLEAU_CONNECTED_APP_SECRET_ID;
  const secretValue = process.env.TABLEAU_CONNECTED_APP_SECRET_VALUE;

  if (!clientId || !secretId || !secretValue) {
    throw new Error("Tableau Connected App environment variables are not configured.");
  }

  return {
    clientId,
    secretId,
    secretValue,
  };
}

export async function getSecretJsonFromSecretsManager<T>(secretId: string): Promise<T> {
  const client = new SecretsManagerClient({});
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!result.SecretString) {
    throw new Error("SecretString was empty.");
  }

  return JSON.parse(result.SecretString) as T;
}

export async function getTableauConnectedAppSecrets(): Promise<TableauConnectedAppSecrets> {
  if (process.env.TABLEAU_CONNECTED_APP_SECRET_ARN) {
    return getSecretJsonFromSecretsManager<TableauConnectedAppSecrets>(process.env.TABLEAU_CONNECTED_APP_SECRET_ARN);
  }

  return getTableauConnectedAppSecretsFromEnv();
}

