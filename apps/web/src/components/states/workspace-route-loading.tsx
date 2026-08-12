import { Skeleton } from "@veza/ui";

export function WorkspaceRouteLoading({
  title,
  context,
  eyebrow,
}: {
  readonly title: string;
  readonly context?: string;
  readonly eyebrow?: string;
}) {
  const announcedContext = context ?? eyebrow;
  return (
    <main className="workspace-route-state workspace-route-loading" role="status" aria-live="polite" aria-label={title}>
      <section>
        <header>
          <Skeleton width="min(10rem, 34%)" height="0.75rem" />
          <Skeleton width="min(32rem, 72%)" height="2.5rem" shape="block" />
          <Skeleton width="min(44rem, 88%)" height="0.85rem" />
        </header>
        <div className="workspace-route-toolbar-skeletons">
          <Skeleton width="min(22rem, 52%)" height="2.6rem" shape="block" />
          <Skeleton width="7rem" height="2.6rem" shape="block" />
        </div>
        <div className="workspace-route-body-skeletons">
          <Skeleton width="100%" height="4rem" shape="block" />
          <Skeleton width="100%" height="4rem" shape="block" />
          <Skeleton width="100%" height="12rem" shape="block" />
        </div>
        <p className="sr-only">{announcedContext ? `${announcedContext}. ` : ""}{title}</p>
      </section>
    </main>
  );
}
