import { Skeleton } from "@veza/ui";

export default function Loading() {
  return <main className="access-route-state" role="status" aria-live="polite"><div><Skeleton width="18%" height=".7rem" /><Skeleton width="52%" height="2.5rem" /><Skeleton width="100%" height="8rem" shape="block" /><Skeleton width="100%" height="20rem" shape="block" /></div></main>;
}
