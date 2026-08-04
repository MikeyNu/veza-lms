import { ControlPlaneShell } from "../../../src/components/control-plane-shell";
import { TenantProvisioningForm } from "../../../src/features/tenants/tenant-provisioning-form";
import { requireOperatorSession } from "../../../src/server/operator-session";

export const dynamic = "force-dynamic";

export default async function NewTenantPage() {
  const session = await requireOperatorSession();
  return <ControlPlaneShell active="/tenants/new" principal={session.principal} environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}><TenantProvisioningForm/></ControlPlaneShell>;
}
