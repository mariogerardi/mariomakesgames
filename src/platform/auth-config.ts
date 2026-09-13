export type BrowserAuthConfig = {
  apiBaseUrl: string;
  cognitoDomain: string;
  cognitoUserPoolClientId: string;
};

export const browserAuthConfig: BrowserAuthConfig = {
  apiBaseUrl: trimTrailingSlash(process.env.NEXT_PUBLIC_API_BASE_URL ?? ""),
  cognitoDomain: trimTrailingSlash(process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? ""),
  cognitoUserPoolClientId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID ?? "",
};

export const browserAuthEnabled = Boolean(
  browserAuthConfig.apiBaseUrl
    && browserAuthConfig.cognitoDomain
    && browserAuthConfig.cognitoUserPoolClientId,
);

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
