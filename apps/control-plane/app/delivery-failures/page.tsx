import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { DeadLetterQueue } from "../../src/features/delivery-failures/dead-letter-queue";
import { loadDeadLetters, type DeadLetterFilters } from "../../src/server/dead-letter-api";
import { requireOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";
type Query = Readonly<Record<string, string | string[] | undefined>>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;
const aggregatePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
function single(value: string | string[] | undefined): string | undefined { return typeof value === "string" ? value.trim() : undefined; }
function matching(value: string | undefined, pattern: RegExp): string | undefined { return value && pattern.test(value) ? value : undefined; }
function timestamp(value: string | undefined): string | undefined { return value && Number.isFinite(Date.parse(value)) ? value : undefined; }

export default async function DeliveryFailuresPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [session, query] = await Promise.all([requireOperatorSession(), searchParams]);
  const filters: DeadLetterFilters = {
    tenantId: matching(single(query.tenantId), uuidPattern),
    eventName: matching(single(query.eventName), eventPattern),
    aggregateType: matching(single(query.aggregateType), aggregatePattern),
    from: timestamp(single(query.from)),
    to: timestamp(single(query.to)),
    cursor: single(query.cursor)?.slice(0, 512),
  };
  const queue = await loadDeadLetters(session.oidc.accessToken, filters);
  return <ControlPlaneShell active="/delivery-failures" principal={session.principal} environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}>
    <DeadLetterQueue queue={queue} filters={filters}/>
  </ControlPlaneShell>;
}
