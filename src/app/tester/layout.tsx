import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { isTesterUser } from "@/server/tester";

export const dynamic = "force-dynamic";

export default async function TesterLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await isTesterUser(session.user.userId))) redirect("/dashboard");
  return children;
}
