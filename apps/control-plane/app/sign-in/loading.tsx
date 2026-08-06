import { Skeleton } from "@veza/ui";
import { OperatorIdentityGateway } from "../../src/components/operator-identity-gateway";

export default function Loading() {
  return (
    <OperatorIdentityGateway eyebrow="PRIVILEGED OPERATOR ACCESS" title="Preparing operator assurance" description="Veza is resolving the separate control-plane identity configuration.">
      <div className="operator-loading" role="status" aria-live="polite">
        <Skeleton width="46%" height="0.75rem" />
        <Skeleton width="100%" height="3rem" shape="block" />
        <Skeleton width="84%" height="0.75rem" />
      </div>
    </OperatorIdentityGateway>
  );
}
