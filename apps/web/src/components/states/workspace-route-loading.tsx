import { Skeleton } from "@veza/ui";

export function WorkspaceRouteLoading({
  eyebrow,
  title,
}: {
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <main className="workspace-route-state workspace-route-loading" role="status" aria-live="polite" aria-label={title}>
      <aside aria-hidden="true">
        <Skeleton width="52%" height="1.1rem" />
        <div className="workspace-route-nav-skeletons">
          {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} width={index % 2 ? "76%" : "88%"} height="2.2rem" shape="block" />)}
        </div>
      </aside>
      <section>
        <header><Skeleton width="14%" height=".65rem" /><Skeleton width="48%" height="2.4rem" /><Skeleton width="68%" height=".72rem" /></header>
        <div className="workspace-route-metric-skeletons">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} width="100%" height="6rem" shape="block" />)}</div>
        <div className="workspace-route-body-skeletons"><Skeleton width="100%" height="3.1rem" shape="block" /><Skeleton width="100%" height="21rem" shape="block" /></div>
        <p className="sr-only">{eyebrow}. {title}</p>
      </section>
    </main>
  );
}
