import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminOnlinePkPage() {
  redirect("/admin?tab=online-pk");
}
