export default function AccessPendingPage() {
  return <main className="workspace-select-page"><section className="workspace-select-panel access-pending">
    <div className="auth-brand-lockup"><span className="brand-mark">V</span><div><strong>veza</strong><small>LEARNING CLOUD</small></div></div>
    <p className="eyebrow">ACCESS NOT ASSIGNED</p>
    <h1>Your identity is verified, but no active workspace is available.</h1>
    <p>Your institution administrator must issue or reactivate a membership before Veza can open institutional data.</p>
    <div className="pending-guidance"><strong>Next step</strong><p>Contact the person who invited you or your institution administrator and ask them to confirm your membership status.</p></div>
    <form action="/api/auth/sign-out" method="post"><button className="auth-secondary" type="submit">Sign out</button></form>
  </section></main>;
}
