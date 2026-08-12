import { Button, ButtonLink, Field, Icon, Link as VezaLink, TextInput } from "@veza/ui";
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
      context="Institution sign-in"
      title="Sign in to your institution workspace."
      description="Your institution's identity provider verifies your account. Veza receives only the verified claims needed to resolve your memberships and access scope."
      aside={<><strong>Need access rather than account recovery?</strong><span>Your institution administrator controls memberships and role scope. Veza support cannot grant access to institutional records.</span></>}
      footer={<>By continuing, you enter the identity and access policy configured by your institution.</>}
    >
      {error ? <IdentityStatus tone="danger" title={error.title}>{error.detail}</IdentityStatus> : null}
      <div className="identity-action-stack">
        <ButtonLink className="identity-full-action" href={signInPath} trailingIcon={<Icon name="arrow" />}>
          Continue with institution sign-in
        </ButtonLink>
      </div>
      <div className="identity-divider"><span>or use an email hint</span></div>
      <form action="/api/auth/sign-in" method="get" className="identity-action-stack">
        {returnTo !== "/" ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <Field label="Institution email address">
          <TextInput
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@institution.edu"
            maxLength={320}
          />
        </Field>
        <Button className="identity-full-action" variant="secondary" type="submit">Continue with email hint</Button>
      </form>
      <div className="identity-compact-actions">
        <VezaLink variant="quiet" href="/account-help">Trouble signing in?</VezaLink>
        <VezaLink variant="quiet" href="/reset-password">Reset password</VezaLink>
      </div>
    </IdentityGateway>
  );
}
