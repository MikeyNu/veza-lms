import { notFound } from "next/navigation";
import { DesignSystemCatalogue } from "../../src/features/design-system/design-system-catalogue";
import { RouteBreadcrumbs } from "../../src/components/route-breadcrumbs";
import { requireWorkspaceAccess } from "../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";

export default async function DesignSystemPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.VEZA_ENABLE_DESIGN_SYSTEM_CATALOGUE !== "true"
  ) {
    notFound();
  }

  await requireWorkspaceAccess("/design-system");

  return (
    <>
      <RouteBreadcrumbs variant="standalone" />
      <DesignSystemCatalogue />
    </>
  );
}
