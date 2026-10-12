import LandingPageClient from "./LandingPageClient";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { getMaintenanceState } = await import("@/server/maintenance");
  const maintenance = await getMaintenanceState();
  if (maintenance.enabled) return <MaintenanceScreen state={maintenance} />;
  return <LandingPageClient />;
}
