function configuredUrl(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  const localDevelopment = process.env.NODE_ENV !== "production"
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error(`${name} must use HTTPS`);
  }
  if (url.username || url.password || url.hash) {
    throw new Error(`${name} must not contain credentials or a fragment`);
  }
  return url.toString();
}

export function identityProviderRecoveryUrl(): string | undefined {
  return configuredUrl("OIDC_ACCOUNT_RECOVERY_URL");
}

export function identityProviderSupportUrl(): string | undefined {
  return configuredUrl("OIDC_ACCOUNT_SUPPORT_URL");
}
