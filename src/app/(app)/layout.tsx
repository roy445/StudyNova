import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { user } = session;
  return (
    <AppShell user={{ userId: user.userId, novaId: user.novaId, displayName: user.displayName, role: user.role, isPro: user.isPro }}>
      {children}
    </AppShell>
  );
}
