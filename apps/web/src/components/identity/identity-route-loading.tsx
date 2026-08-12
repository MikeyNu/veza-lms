import { Skeleton } from "@veza/ui";
import { IdentityGateway } from "./identity-gateway";

export function IdentityRouteLoading({ label = "Verifying secure context" }: { readonly label?: string }) {
  return (
    <IdentityGateway
      context="Identity verification"
      title={label}
      description="Veza is resolving the next identity step without opening institutional data before its access boundary is verified."
    >
      <div className="identity-action-stack" role="status" aria-live="polite" aria-label={label}>
        <Skeleton width="42%" height="0.75rem" />
        <Skeleton width="100%" height="2.95rem" shape="block" />
        <Skeleton width="100%" height="2.95rem" shape="block" />
        <Skeleton width="68%" height="0.7rem" />
      </div>
    </IdentityGateway>
  );
}
