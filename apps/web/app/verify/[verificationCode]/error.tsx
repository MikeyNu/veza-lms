"use client";

import { Button, ButtonLink } from "@veza/ui";
import { useEffect } from "react";
import { RouteBreadcrumbs } from "../../../src/components/route-breadcrumbs";
import styles from "./page.module.css";

export default function VerificationError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("Credential verification route failed", { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <>
      <RouteBreadcrumbs variant="public" />
      <main className={styles.page}>
        <section className={styles.record} aria-labelledby="credential-verification-error-title">
          <header className={styles.heading}>
            <a className={styles.brand} href="/" aria-label="Veza LMS home">
              <img src="/branding/veza-logo-dark.png" alt="Veza LMS" />
            </a>
            <div>
              <p className={styles.context}>Credential verification</p>
              <h1 id="credential-verification-error-title">Verification service unavailable</h1>
              <p>The issuer record could not be checked. This does not mean the credential is invalid.</p>
            </div>
          </header>
          <div className={styles.errorActions}>
            <Button type="button" onClick={reset}>Retry verification</Button>
            <ButtonLink variant="secondary" href="/">Return to Veza</ButtonLink>
          </div>
          {error.digest ? <p className={styles.supportReference}>Support reference: <code>{error.digest}</code></p> : null}
        </section>
      </main>
    </>
  );
}
