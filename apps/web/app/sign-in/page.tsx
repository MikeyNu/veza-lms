import { redirect } from "next/navigation";
import { getWebOidcSession } from "../../src/server/web-session";

const errorMessages: Readonly<Record<string, string>> = {
  invalid_callback: "The sign-in response was incomplete. Start again from this page.",
  provider_error: "The institution identity provider did not complete sign-in.",
  access_not_ready: "Your identity is valid, but Veza could not resolve access yet.",
  authentication_failed: "The secure sign-in exchange could not be completed.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, query] = await Promise.all([getWebOidcSession(), searchParams]);
  if (session) redirect("/");
  return <main className="auth-page">
    <section className="auth-brand" aria-label="Veza Learning Cloud">
      <div className="auth-brand-lockup"><span className="brand-mark">V</span><div><strong>veza</strong><small>LEARNING CLOUD</small></div></div>
      <div className="auth-copy"><p className="eyebrow">YOUR INSTITUTION. ONE LEARNING SYSTEM.</p><h1>Move from administration to learning without losing context.</h1><p>Veza keeps identity, classes, assessments, communication and progress inside one governed institutional workspace.</p></div>
      <div className="auth-proof"><span>Tenant isolated</span><span>Accessible by design</span><span>Institution branded</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-form"><p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace</h2><p>Use the sign-in method configured by your institution.</p>
        {query.error ? <p className="auth-error" role="alert">{errorMessages[query.error] ?? "Sign-in could not be completed. Please try again."}</p> : null}
        <a className="auth-sso" href="/api/auth/sign-in">Continue with institution SSO <span>→</span></a>
        <div className="auth-divider"><span>or</span></div>
        <form action="/api/auth/sign-in" method="get" className="auth-email-form"><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@institution.edu"/></label><button className="auth-secondary" type="submit">Continue with email</button></form>
        <small>Having trouble? Contact your institution administrator before retrying sign-in. Veza support cannot assign institutional membership.</small>
      </div>
    </section>
  </main>;
}
