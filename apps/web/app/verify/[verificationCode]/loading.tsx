import { Skeleton } from "@veza/ui";
import { RouteBreadcrumbs } from "../../../src/components/route-breadcrumbs";
import styles from "./page.module.css";

export default function VerificationLoading() {
  return (
    <>
      <RouteBreadcrumbs variant="public" />
      <main className={styles.page}>
        <section className={styles.record} aria-label="Verifying credential" role="status" aria-live="polite">
          <header className={styles.heading}>
            <Skeleton width="8.5rem" height="2rem" />
            <div className={styles.loadingHeading}>
              <Skeleton width="9rem" height="0.8rem" />
              <Skeleton width="min(100%, 24rem)" height="2.4rem" shape="block" />
              <Skeleton width="min(100%, 31rem)" height="0.9rem" />
            </div>
          </header>
          <Skeleton width="100%" height="4.8rem" shape="block" />
          <div className={styles.loadingGrid}>
            <Skeleton width="100%" height="4rem" shape="block" />
            <Skeleton width="100%" height="4rem" shape="block" />
            <Skeleton width="100%" height="4rem" shape="block" />
            <Skeleton width="100%" height="4rem" shape="block" />
          </div>
        </section>
      </main>
    </>
  );
}
