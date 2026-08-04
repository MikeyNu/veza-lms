import { AppShell } from "../src/components/app-shell";
import { DashboardOverview } from "../src/features/dashboard/dashboard-overview";

export default function DashboardPage() {
  return <AppShell><DashboardOverview/></AppShell>;
}
