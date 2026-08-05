import { notFound } from "next/navigation";
import { DesignSystemCatalogue } from "../../src/features/design-system/design-system-catalogue";

export const dynamic = "force-dynamic";

export default function DesignSystemPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.VEZA_ENABLE_DESIGN_SYSTEM_CATALOGUE !== "true"
  ) {
    notFound();
  }

  return <DesignSystemCatalogue />;
}
