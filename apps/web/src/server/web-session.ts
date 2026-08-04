import { cookies } from "next/headers";
import { readSessionCookie, type OidcSession } from "@veza/oidc-bff";
import { webOidcConfig, webSessionCookieName } from "./auth-config";

export async function getWebOidcSession(): Promise<OidcSession | undefined> {
  const value = (await cookies()).get(webSessionCookieName)?.value;
  if (!value) return undefined;
  try {
    return readSessionCookie(webOidcConfig(), value);
  } catch {
    return undefined;
  }
}
