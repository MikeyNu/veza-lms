import { secureReturnTo } from "@veza/oidc-bff";
import { redirect } from "next/navigation";
import {
  IdentityGateway,
  IdentityStatus,
} from "../../src/components/identity/identity-gateway";
import { getWebOidcSession } from "../../src/server/web-session";

const errorMessages: Readonly<Record<string, { readonly title: string; readonly detail: string }>> = {
  invalid_callback: {
    title: "The identity response was incomplete",
    detail: "No workspace was opened. Start a new secure sign-in from this page.",
  },
  provider_error: {
    title: "Your institution did not complete sign-in",
    detail: "The identity provider returned an error before Veza received a verified identity.",
  },
  access_not_ready: {
    title: "Your identity is valid but access is not ready",
    detail: "Sign-in succeeded, but Veza could not resolve an active institutional membership.",
  },
  authentication_failed: {
    title: "The secure sign-in exchange failed",
    detail: "No institutional data was opened. Retry the exchange or use account help below.",
  },
};

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const [session, query] = await Promise.all([getWebOidcSession(), searchParams]);
  if (session) redirect("/");

  const returnTo = secureReturnTo(query.returnTo);
  const signInParameters = new URLSearchParams();
  if (returnTo !== "/") signInParameters.set("returnTo", returnTo);
  const signInPath = `/api/auth/sign-in${signInParameters.size ? `?${signInParameters}` : ""}`;
  const error = query.error ? errorMessages[query.error] : undefined;

  return (
    <IdentityGateway
      eyebrow="SECURE INSTITUTION SIGN-IN"
      title="Enter the workspace your institution governs."
      description="Veza uses the identity provider selected by your institution. Your password, MFA method and recovery credentials never pass through this application."
      stage="Identity gateway"
      aside={<><strong>Need access instead of account recovery?</strong><span>Your institution administrator controls memberships and role scope. Veza support cannot grant access to institutional records.</span></>}
      footer={<>By continuing, you enter the identity and access policy configured by your institution. Veza records only the verified identity claims required to resolve your memberships.</>}
    >
      {error ? <IdentityStatus tone="danger" title={error.title}>{error.detail}</IdentityStatus> : null}
      <div className="identity-action-stack">
        <a className="identity-primary" href={signInPath}>
          Continue with institution sign-in <span aria-hidden="true">→</span>
        </a>
      </div>
      <div className="identity-divider"><span>or identify your account</span></div>
      <form action="/api/auth/sign-in" method="get" className="identity-action-stack">
        {returnTo !== "/" ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <label className="identity-field">
          <span>Institution email address</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@institution.edu"
            maxLength={320}
          />
        </label>
        <button className="identity-secondary" type="submit">Continue with email hint</button>
      </form>
      <div className="identity-compact-actions">
        <a className="identity-text-link" href="/account-help">Trouble signing in?</a>
        <a className="identity-text-link" href="/reset-password">Reset password</a>
      </div>
    </IdentityGateway>
  );
}
