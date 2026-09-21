import { getMaintenanceState } from "@/server/maintenance";
import LandingPageClient from "./LandingPageClient";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const maintenance = await getMaintenanceState();
  if (maintenance.enabled) return <MaintenanceScreen state={maintenance} />;
  return <LandingPageClient />;
}
