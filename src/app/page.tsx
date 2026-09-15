import { getMaintenanceState } from "@/server/maintenance";
import LandingPageClient from "./LandingPageClient";
import { MaintenanceNotice } from "@/components/MaintenanceNotice";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const maintenance = await getMaintenanceState();
  return <><MaintenanceNotice state={maintenance} /><LandingPageClient /></>;
}
