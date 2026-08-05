import { verifyCertificatePublic } from "../../../src/server/academic-evidence-api";

export const dynamic = "force-dynamic";

export default async function VerificationPage({ params }: { params: Promise<{ verificationCode: string }> }) {
  const { verificationCode } = await params;
  const result = await verifyCertificatePublic(verificationCode);
  const payload = result.payload ?? {};
  return <main className="vz-verification-page"><section><header><div className="vz-wordmark">VEZA</div><span>Credential verification</span></header>{result.valid ? <><div className="vz-verification-status valid"><span>Verified</span><strong>This credential is active and matches the issuing record.</strong></div><dl><div><dt>Learner</dt><dd>{String(payload.learnerName ?? "Recorded learner")}</dd></div><div><dt>Credential</dt><dd>{String(payload.credentialTitle ?? "Veza credential")}</dd></div><div><dt>Issued</dt><dd>{result.issuedAt ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeZone: "Africa/Johannesburg" }).format(new Date(result.issuedAt)) : "Recorded"}</dd></div><div><dt>Verification code</dt><dd><code>{verificationCode.toUpperCase()}</code></dd></div></dl></> : <><div className="vz-verification-status invalid"><span>Not valid</span><strong>{result.status === "revoked" ? "This credential has been revoked." : "No active credential matches this verification code."}</strong></div>{result.revocationReason ? <p className="vz-revocation-reason">{result.revocationReason}</p> : null}</>}<footer>Verification reflects the current issuer record. A screenshot is not proof of continued validity.</footer></section></main>;
}
