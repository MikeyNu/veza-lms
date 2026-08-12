import { Icon } from "@veza/ui";
import { RouteBreadcrumbs } from "../../../src/components/route-breadcrumbs";
import { verifyCertificatePublic } from "../../../src/server/academic-evidence-api";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function payloadString(payload: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function issuedDate(value: string | undefined): string {
  if (!value) return "Recorded by issuer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded by issuer";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function invalidMessage(status: string | undefined): string {
  if (status === "revoked") return "This credential was revoked by the issuer and is no longer valid.";
  if (status === "superseded") return "This credential was superseded by a newer issuer record.";
  return "No active issuer record matches this verification code.";
}

export default async function VerificationPage({ params }: { params: Promise<{ verificationCode: string }> }) {
  const { verificationCode } = await params;
  const result = await verifyCertificatePublic(verificationCode);
  const learnerName = result.learnerName ?? payloadString(result.payload, "learnerName") ?? "Recorded learner";
  const credentialTitle = result.credentialTitle ?? payloadString(result.payload, "credentialTitle") ?? "Veza credential";

  return (
    <>
      <RouteBreadcrumbs variant="public" />
      <main className={styles.page}>
        <section className={styles.record} aria-labelledby="credential-verification-title">
          <header className={styles.heading}>
            <a className={styles.brand} href="/" aria-label="Veza LMS home">
              <img src="/branding/veza-logo-dark.png" alt="Veza LMS" />
            </a>
            <div>
              <p className={styles.context}>Credential verification</p>
              <h1 id="credential-verification-title">{result.valid ? "Credential verified" : "Credential not valid"}</h1>
              <p>Verification reflects the issuer record available at the time of this check.</p>
            </div>
          </header>

          <div className={`${styles.status} ${result.valid ? styles.valid : styles.invalid}`} role="status">
            <Icon name={result.valid ? "check-circle" : "close"} size="medium" />
            <div>
              <strong>{result.valid ? "Active issuer record" : "Verification failed"}</strong>
              <span>{result.valid ? "This credential is active and matches the issuing record." : invalidMessage(result.status)}</span>
            </div>
          </div>

          {result.valid ? (
            <dl className={styles.details}>
              <div><dt>Learner</dt><dd>{learnerName}</dd></div>
              <div><dt>Credential</dt><dd>{credentialTitle}</dd></div>
              <div><dt>Issued</dt><dd>{issuedDate(result.issuedAt)}</dd></div>
              <div><dt>Verification code</dt><dd><code>{verificationCode.toUpperCase()}</code></dd></div>
            </dl>
          ) : result.revocationReason ? (
            <div className={styles.reason}>
              <strong>Issuer reason</strong>
              <p>{result.revocationReason}</p>
            </div>
          ) : null}

          <footer className={styles.note}>
            A saved screenshot does not prove continued validity. Recheck this page when current verification matters.
          </footer>
        </section>
      </main>
    </>
  );
}
