import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionCookie, type OidcSession } from "@veza/oidc-bff";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import { controlPlaneOidcConfig, operatorSessionCookieName } from "./auth-config";
import { loadOperatorPrincipal } from "./operator-api";

export interface OperatorSession {
  readonly oidc: OidcSession;
  readonly principal: AuthenticatedPrincipal;
}

export async function getOperatorSession(): Promise<OperatorSession | undefined> {
  const value = (await cookies()).get(operatorSessionCookieName)?.value;
  if (!value) return undefined;
  try {
    const oidc = readSessionCookie(controlPlaneOidcConfig(), value);
    const principal = await loadOperatorPrincipal(oidc.accessToken);
    return principal ? { oidc, principal } : undefined;
  } catch {
    return undefined;
  }
}

export async function requireOperatorSession(): Promise<OperatorSession> {
  const session = await getOperatorSession();
  if (!session) redirect("/sign-in");
  return session;
}
