import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { EventPlatformWorkspace } from "../../src/features/events/event-platform-workspace";
import { loadEventPlatform } from "../../src/server/event-platform-api";
import { requireOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";

export default async function EventPlatformPage() {
  const session = await requireOperatorSession();
  const platform = await loadEventPlatform(session.oidc.accessToken);
  return (
    <ControlPlaneShell
      active="/events"
      principal={session.principal}
      environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}
    >
      <EventPlatformWorkspace overview={platform.overview} schemas={platform.schemas} />
    </ControlPlaneShell>
  );
}
